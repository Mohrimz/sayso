"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { DropdownMenu, Tooltip } from "radix-ui";
import { Check, ChevronRight, ChevronsUpDown, CirclePlus, House, Inbox, LayoutDashboard, LogOut, ShieldCheck, SquareKanban, UserRound, UsersRound } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { useSignOut } from "@/components/arrival/arrival";
import { Logo } from "@/components/logo";
import { PageHelp } from "@/components/page-help";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { NotificationsPanel } from "./notifications-panel";
import { Tour } from "@/components/onboarding/tour";
import { Avatar } from "@/components/ui";
import { insightFor, navHint, routeFor, type Audience } from "@/lib/insights";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useChatUnread, viewingChat } from "./use-chat-unread";
import { chatUnreadFor, clientSummary, currentWorkspace, workspaceItems, type ChatCounts, type NavItem as Item, type ShellData, type ShellWorkspace } from "./nav-model";
import { CountBubble, MobileContext, MobileSheets, MobileTabBar, useMobileSheet } from "./mobile-nav";

export type { ShellData, ShellWorkspace } from "./nav-model";

const spring = { type: "spring", stiffness: 500, damping: 40 } as const;
const menuItem =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-sunken data-[highlighted]:text-ink";

export function Chrome({ data }: { data: ShellData }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useMobileSheet(pathname);
  const current = currentWorkspace(pathname, data);
  const audience: Audience = current ? current.role : data.viewer.side === "agency" ? "agency" : "viewer";
  const route = routeFor(pathname, audience);
  const insight = route ? insightFor(route.key, audience) : null;
  const home = data.viewer.side === "agency" ? "/dashboard" : current ? `/w/${current.slug}` : "/";
  const chat = useChatUnread(data.chat, data.viewer.id, viewingChat(pathname, data.workspaces));

  return (
    <>
      {/* Keeps the bell count live: new notifications and ones marked read. */}
      <RealtimeRefresh channel={`notifications:${data.viewer.id}`} watch={[{ table: "notifications", filter: `user_id=eq.${data.viewer.id}` }]} />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface lg:flex" aria-label="Sidebar">
        <Sidebar data={data} chat={chat} current={current} pathname={pathname} home={home} scope="desktop" tooltips />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-canvas/85 pr-2 pl-4 backdrop-blur-md sm:pr-4 sm:pl-6 lg:ml-[264px] lg:gap-2 lg:px-10">
        <div className="min-w-0 flex-1">
          <MobileContext data={data} current={current} home={home} onSwitch={() => setSheet("switch")} />
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm lg:flex">
            {current && data.viewer.side === "agency" ? (
              <>
                <Link href={`/w/${current.slug}`} className="truncate text-muted hover:text-ink">
                  {current.name}
                </Link>
                <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />
              </>
            ) : null}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={route?.label ?? "page"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="truncate font-medium text-ink"
              >
                {route?.label ?? ""}
              </motion.span>
            </AnimatePresence>
          </nav>
        </div>
        {insight ? <PageHelp insight={insight} /> : null}
        <NotificationsPanel userId={data.viewer.id} unread={data.unread} />
      </header>

      {/* The walkthrough after a client's first sign-in (?tour=N). */}
      {current && data.viewer.side === "client" ? (
        <Suspense fallback={null}>
          <Tour slug={current.slug} role={current.role} />
        </Suspense>
      ) : null}

      <MobileTabBar data={data} current={current} pathname={pathname} chat={chat} onSheet={setSheet} />
      <MobileSheets sheet={sheet} onClose={() => setSheet(null)} data={data} current={current} pathname={pathname} chat={chat} />
    </>
  );
}

function Sidebar({
  data,
  chat,
  current,
  pathname,
  home,
  scope,
  tooltips = false,
  onNavigate,
}: {
  data: ShellData;
  chat: ChatCounts;
  current?: ShellWorkspace;
  pathname: string;
  home: string;
  scope: string;
  tooltips?: boolean;
  onNavigate?: () => void;
}) {
  const { viewer } = data;
  const isAgency = viewer.side === "agency";
  const audience: Audience = current ? current.role : isAgency ? "agency" : "viewer";

  const inboxCount = isAgency ? data.workspaces.reduce((sum, w) => sum + chatUnreadFor(w, chat), 0) : 0;
  const agencyItems: Item[] = isAgency
    ? [
        { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, active: pathname === "/dashboard" },
        {
          key: "inbox",
          href: "/inbox",
          label: "Inbox",
          icon: Inbox,
          active: pathname === "/inbox",
          badge: inboxCount ? { count: inboxCount, tone: "accent" } : undefined,
        },
        { key: "board", href: "/tasks", label: "Team board", icon: SquareKanban, active: pathname === "/tasks" },
        ...(viewer.isAdmin ? [{ key: "team", href: "/team", label: "Team", icon: UsersRound, active: pathname === "/team" }] : []),
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-5 lg:h-16">
        <Link href={home} onClick={onNavigate} aria-label="Home">
          <Logo />
        </Link>
      </div>

      <LayoutGroup id={scope}>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4" aria-label="Main">
          {agencyItems.length ? (
            <div className="space-y-0.5">
              {agencyItems.map((item) => (
                <NavItem key={item.key} item={item} hint={navHint(item.key, "agency")} tooltips={tooltips} onNavigate={onNavigate} />
              ))}
            </div>
          ) : null}

          <div className={cn(agencyItems.length && "mt-4 border-t border-line pt-4")}>
            {isAgency || data.workspaces.length > 1 ? (
              <WorkspaceSwitcher workspaces={data.workspaces} chat={chat} current={current} isAgency={isAgency} isAdmin={viewer.isAdmin} onNavigate={onNavigate} />
            ) : current ? (
              <div className="flex items-center gap-3 rounded-xl bg-sunken/70 px-3 py-2.5">
                <Avatar name={current.name} src={current.logo} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{current.name}</p>
                  <p className="text-xs text-muted">{ROLE_LABELS[current.role]}</p>
                </div>
              </div>
            ) : null}

            {current ? (
              <div className="mt-2 space-y-0.5">
                {workspaceItems(current, pathname, chat).map((item) => (
                  <NavItem key={item.key} item={item} hint={navHint(item.key, audience)} tooltips={tooltips} onNavigate={onNavigate} />
                ))}
              </div>
            ) : isAgency ? (
              <div className="mt-2 space-y-0.5">
                {data.workspaces.map((w) => (
                  <Link key={w.slug} href={`/w/${w.slug}`} onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-sunken">
                    <Avatar name={w.name} src={w.logo} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{w.name}</span>
                      <span className="block truncate text-xs text-muted">{clientSummary(w, chat)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </nav>
      </LayoutGroup>

      <div className="shrink-0 border-t border-line p-3">
        <UserMenu name={viewer.name} email={viewer.email} avatar={viewer.avatar} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function NavItem({ item, hint, tooltips, onNavigate }: { item: Item; hint: string; tooltips: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        item.active ? "text-accent-ink" : "text-ink-soft hover:bg-sunken hover:text-ink",
      )}
    >
      {item.active ? <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-accent-soft" transition={spring} /> : null}
      <Icon className={cn("relative size-[18px] shrink-0", item.active ? "text-accent" : "text-muted group-hover:text-ink")} />
      <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? <CountBubble count={item.badge.count} tone={item.badge.tone} className="relative" /> : null}
    </Link>
  );
  if (!tooltips || !hint) return link;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} className="animate-pop z-50 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
          {hint}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function WorkspaceSwitcher({
  workspaces,
  chat,
  current,
  isAgency,
  isAdmin,
  onNavigate,
}: {
  workspaces: ShellWorkspace[];
  chat: ChatCounts;
  current?: ShellWorkspace;
  isAgency: boolean;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.03)] outline-none hover:border-line-strong focus-visible:border-accent data-[state=open]:border-accent">
        {current ? (
          <Avatar name={current.name} src={current.logo} />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-sunken text-muted">
            <House className="size-4" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{current ? current.name : "Choose a client"}</span>
          <span className="block truncate text-xs text-muted">
            {current ? (isAgency ? clientSummary(current, chat) : ROLE_LABELS[current.role]) : `${workspaces.length} clients`}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="animate-pop z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10"
        >
          <DropdownMenu.Label className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
            {isAgency ? "Clients" : "Workspaces"}
          </DropdownMenu.Label>
          <div className="max-h-72 overflow-y-auto">
            {workspaces.map((w) => (
              <DropdownMenu.Item key={w.slug} asChild>
                <Link href={`/w/${w.slug}`} onClick={onNavigate} className={menuItem}>
                  <Avatar name={w.name} src={w.logo} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{w.name}</span>
                    {isAgency ? <span className="block truncate text-[11px] text-muted">{clientSummary(w, chat)}</span> : null}
                  </span>
                  {w.slug === current?.slug ? <Check className="size-4 text-accent" aria-hidden /> : null}
                </Link>
              </DropdownMenu.Item>
            ))}
          </div>
          {isAgency ? (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
              <DropdownMenu.Item asChild>
                <Link href="/dashboard" onClick={onNavigate} className={menuItem}>
                  <LayoutDashboard className="size-4" aria-hidden /> All clients
                </Link>
              </DropdownMenu.Item>
              {isAdmin ? (
                <DropdownMenu.Item asChild>
                  <Link href="/clients/new" onClick={onNavigate} className={menuItem}>
                    <CirclePlus className="size-4" aria-hidden /> New client
                  </Link>
                </DropdownMenu.Item>
              ) : null}
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function UserMenu({ name, email, avatar, onNavigate }: { name: string; email: string; avatar: string | null; onNavigate?: () => void }) {
  const signOutWithGoodbye = useSignOut();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-sunken data-[state=open]:bg-sunken" aria-label="Account menu">
        <Avatar name={name} src={avatar} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-muted">{email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="animate-pop z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10"
        >
          <DropdownMenu.Item asChild>
            <Link href="/account" onClick={onNavigate} className={menuItem}>
              <UserRound className="size-4" aria-hidden /> Account and emails
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/privacy" onClick={onNavigate} className={menuItem}>
              <ShieldCheck className="size-4" aria-hidden /> Privacy Policy
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item className={menuItem} onSelect={() => signOutWithGoodbye(name, signOut)}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

