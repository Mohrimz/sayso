import type { ComponentType } from "react";
import { BadgePercent, CalendarDays, House, Images, ListTodo, MessagesSquare, Palette, Settings } from "lucide-react";
import { permissionsFor, type WorkspaceRole } from "@/lib/permissions";
import { chatKey } from "@/lib/chat";

/** What the navigation needs to know: shared by the desktop sidebar and the phone tab bar. */

export type ChatCounts = Record<string, number>;

export type ShellWorkspace = {
  id: string;
  slug: string;
  name: string;
  /** The client's logo (a /avatars/… address), or null to show initials. */
  logo: string | null;
  status: string;
  role: WorkspaceRole;
  awaiting: number;
  changes: number;
  review: number;
};

export type ShellData = {
  viewer: { id: string; name: string; email: string; side: "agency" | "client"; isAdmin: boolean; avatar: string | null };
  workspaces: ShellWorkspace[];
  unread: number;
  /** Unread chat messages, keyed "<workspace id>:<channel>". */
  chat: ChatCounts;
};

export type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>;
export type NavItem = { key: string; href: string; label: string; icon: NavIcon; active: boolean; badge?: { count: number; tone: "accent" | "orange" } };

/** Unread chat messages in a workspace, across every conversation the person can see. */
export function chatUnreadFor(ws: { id: string }, counts: ChatCounts) {
  return (counts[chatKey(ws.id, "client")] ?? 0) + (counts[chatKey(ws.id, "team")] ?? 0) + (counts[chatKey(ws.id, "direct")] ?? 0);
}

export function currentWorkspace(pathname: string, data: ShellData): ShellWorkspace | undefined {
  const slug = /^\/w\/([^/]+)/.exec(pathname)?.[1];
  if (slug) return data.workspaces.find((w) => w.slug === slug);
  if (data.viewer.side === "client" && data.workspaces.length === 1) return data.workspaces[0];
  return undefined;
}

export function workspaceItems(ws: ShellWorkspace, pathname: string, chat: ChatCounts): NavItem[] {
  const can = permissionsFor(ws.role);
  const base = `/w/${ws.slug}`;
  const messages = chatUnreadFor(ws, chat);
  const items: NavItem[] = [
    {
      key: "home",
      href: base,
      label: can.isAgency ? "Overview" : "Home",
      icon: House,
      active: pathname === base,
      badge: can.isAgency
        ? ws.changes ? { count: ws.changes, tone: "orange" } : undefined
        : ws.awaiting ? { count: ws.awaiting, tone: "accent" } : undefined,
    },
    { key: "plan", href: `${base}/plan`, label: "Monthly plan", icon: CalendarDays, active: pathname.startsWith(`${base}/plan`) || pathname.startsWith(`${base}/content/`) },
    {
      key: "chat",
      href: `${base}/chat`,
      label: "Chat",
      icon: MessagesSquare,
      active: pathname.startsWith(`${base}/chat`),
      badge: messages ? { count: messages, tone: "accent" } : undefined,
    },
    { key: "tasks", href: `${base}/tasks`, label: can.isAgency ? "Tasks" : "Action items", icon: ListTodo, active: pathname.startsWith(`${base}/tasks`) },
    { key: "brand", href: `${base}/brand`, label: "Brand kit", icon: Palette, active: pathname.startsWith(`${base}/brand`) },
    { key: "library", href: `${base}/library`, label: "Library", icon: Images, active: pathname.startsWith(`${base}/library`) },
    { key: "offers", href: `${base}/offers`, label: "Offers", icon: BadgePercent, active: pathname.startsWith(`${base}/offers`) },
  ];
  if (can.isAgency || can.seeBilling) {
    items.push({
      key: "settings",
      href: `${base}/settings`,
      label: can.manageWorkspace ? "Settings" : can.isAgency ? "Client profile" : "Team & package",
      icon: Settings,
      active: pathname.startsWith(`${base}/settings`),
    });
  }
  return items;
}

export function clientSummary(w: ShellWorkspace, chat: ChatCounts = {}) {
  const parts: string[] = [];
  const messages = chatUnreadFor(w, chat);
  if (messages) parts.push(`${messages} new ${messages === 1 ? "message" : "messages"}`);
  if (w.awaiting) parts.push(`${w.awaiting} with client`);
  if (w.changes) parts.push(`${w.changes} to revise`);
  if (w.review) parts.push(`${w.review} in review`);
  return parts.length ? parts.join(" · ") : "All caught up";
}
