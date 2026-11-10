"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { animate, AnimatePresence, LayoutGroup, motion, useMotionValue } from "motion/react";
import { Dialog } from "radix-ui";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Ellipsis,
  Inbox,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  UserRound,
  UsersRound,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { useSignOut } from "@/components/arrival/arrival";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { chatUnreadFor, clientSummary, workspaceItems, type ChatCounts, type NavIcon, type ShellData, type ShellWorkspace } from "./nav-model";

/*
 * Phones and tablets: an app-style bottom tab bar on every page, a "More" sheet
 * for everything else, and a client switcher sheet opened from the top bar.
 * The tab bar is 56px tall plus the safe area (chat and the Sayso button rely on it).
 */

export type MobileSheet = "more" | "switch" | null;

const spring = { type: "spring", stiffness: 520, damping: 38 } as const;

export function CountBubble({ count, className, tone = "accent" }: { count: number; className?: string; tone?: "accent" | "orange" }) {
  return (
    <AnimatePresence initial={false}>
      {count ? (
        <motion.span
          key={count}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          className={cn(
            "flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-[18px] font-semibold tabular-nums",
            tone === "orange" ? "bg-orange-500 text-white" : "bg-accent text-white",
            className,
          )}
        >
          {count > 9 ? "9+" : count}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** Left side of the phone top bar: the client you're in (tap to switch), or the logo. */
export function MobileContext({ data, current, home, onSwitch }: { data: ShellData; current?: ShellWorkspace; home: string; onSwitch: () => void }) {
  const canSwitch = data.viewer.side === "agency" || data.workspaces.length > 1;
  if (!current) {
    return (
      <Link href={home} className="flex items-center lg:hidden" aria-label="Home">
        <Logo />
      </Link>
    );
  }
  const body = (
    <>
      <Avatar name={current.name} size="sm" />
      <span className="truncate text-[15px] font-semibold text-ink">{current.name}</span>
      {canSwitch ? <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
  return canSwitch ? (
    <button
      type="button"
      onClick={onSwitch}
      aria-haspopup="dialog"
      aria-label={`${current.name}. Switch client`}
      className="-ml-1.5 flex max-w-full min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 transition-colors active:bg-sunken lg:hidden"
    >
      {body}
    </button>
  ) : (
    <Link href={home} className="flex min-w-0 items-center gap-2 lg:hidden">
      {body}
    </Link>
  );
}

type Tab = {
  key: string;
  label: string;
  icon: NavIcon;
  active: boolean;
  href?: string;
  sheet?: Exclude<MobileSheet, null>;
  badge?: { count: number; tone: "accent" | "orange" };
};

/** Workspace pages that get their own tab; the rest live in the More sheet. */
const TAB_KEYS = ["home", "plan", "chat", "tasks"];

function tabsFor(data: ShellData, current: ShellWorkspace | undefined, pathname: string, chat: ChatCounts): Tab[] {
  const isAgency = data.viewer.side === "agency";
  let tabs: Tab[];
  if (current) {
    const items = workspaceItems(current, pathname, chat);
    const pick = (key: string) => items.find((i) => i.key === key)!;
    tabs = [pick("home"), { ...pick("plan"), label: "Plan" }, pick("chat"), { ...pick("tasks"), label: isAgency ? "Tasks" : "To do" }];
  } else if (isAgency) {
    const inbox = data.workspaces.reduce((sum, w) => sum + chatUnreadFor(w, chat), 0);
    tabs = [
      { key: "dashboard", href: "/dashboard", label: "Home", icon: LayoutDashboard, active: pathname === "/dashboard" },
      { key: "inbox", href: "/inbox", label: "Inbox", icon: Inbox, active: pathname === "/inbox", badge: inbox ? { count: inbox, tone: "accent" } : undefined },
      { key: "board", href: "/tasks", label: "Board", icon: SquareKanban, active: pathname === "/tasks" },
      { key: "clients", label: "Clients", icon: Building2, active: false, sheet: "switch" },
    ];
  } else {
    tabs = [
      { key: "spaces", label: "Workspaces", icon: Building2, active: false, sheet: "switch" },
      { key: "alerts", href: "/notifications", label: "Alerts", icon: Bell, active: pathname === "/notifications" },
    ];
  }
  // "More" lights up for pages that live in it (brand kit, settings, account...).
  tabs.push({ key: "more", label: "More", icon: Ellipsis, active: !tabs.some((t) => t.active), sheet: "more" });
  return tabs;
}

export function MobileTabBar({
  data,
  current,
  pathname,
  chat,
  onSheet,
}: {
  data: ShellData;
  current?: ShellWorkspace;
  pathname: string;
  chat: ChatCounts;
  onSheet: (sheet: Exclude<MobileSheet, null>) => void;
}) {
  const tabs = tabsFor(data, current, pathname, chat);
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-20px_rgba(23,21,28,0.25)] backdrop-blur-xl lg:hidden"
    >
      <LayoutGroup id="tab-bar">
        <ul className="mx-auto grid h-14 max-w-lg" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const inner = (
              <>
                <span className="relative flex h-8 w-14 items-center justify-center">
                  {tab.active ? <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-accent-soft" transition={spring} /> : null}
                  <Icon className={cn("relative size-[22px] transition-colors", tab.active ? "text-accent" : "text-muted")} strokeWidth={tab.active ? 2.2 : 1.8} />
                  {tab.badge ? <CountBubble count={tab.badge.count} tone={tab.badge.tone} className="absolute -top-0.5 right-1" /> : null}
                </span>
                <span className={cn("max-w-full truncate px-0.5 text-[11px] leading-none", tab.active ? "font-semibold text-accent-ink" : "font-medium text-muted")}>
                  {tab.label}
                </span>
              </>
            );
            const cls =
              "flex h-14 w-full flex-col items-center justify-center gap-1 transition-transform duration-150 select-none active:scale-[0.92] [-webkit-tap-highlight-color:transparent]";
            return (
              <li key={tab.key} className="min-w-0">
                {tab.href ? (
                  <Link href={tab.href} aria-current={tab.active ? "page" : undefined} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={() => onSheet(tab.sheet!)} aria-haspopup="dialog" className={cls}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
    </nav>
  );
}

/** A sheet that slides up from the bottom; drag the handle down (or tap outside) to close. */
function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const y = useMotionValue(0);
  const gesture = useRef<{ startY: number; lastY: number; lastT: number; speed: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, speed: 0 };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const moved = e.clientY - g.startY;
    // Follows the finger downwards; resists being pulled up.
    y.set(moved > 0 ? moved : moved * 0.12);
    g.speed = (e.clientY - g.lastY) / Math.max(1, e.timeStamp - g.lastT);
    g.lastY = e.clientY;
    g.lastT = e.timeStamp;
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (e.clientY - g.startY > 90 || g.speed > 0.6) onClose();
    else animate(y, 0, { type: "spring", visualDuration: 0.3, bounce: 0.2 });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fold-right fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-lg flex-col rounded-t-[28px] bg-canvas shadow-2xl outline-none lg:hidden"
                style={{ y }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                transition={{ type: "spring", visualDuration: 0.36, bounce: 0.12 }}
              >
                <div
                  className="shrink-0 cursor-grab touch-none px-5 pt-2.5 pb-2 select-none active:cursor-grabbing"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerEnd}
                  onPointerCancel={onPointerEnd}
                >
                  <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
                  <Dialog.Title className="mt-3 text-lg font-semibold text-ink">{title}</Dialog.Title>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-1">
      {title ? <h3 className="truncate px-2 pb-1.5 font-sans text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</h3> : null}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>
    </section>
  );
}

function Row({
  href,
  icon: Icon,
  label,
  hint,
  badge,
  active,
  onNavigate,
}: {
  href: string;
  icon: NavIcon;
  label: string;
  hint?: string;
  badge?: number;
  active?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className="flex items-center gap-3 px-3.5 py-3 transition-colors active:bg-sunken">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-accent-soft text-accent" : "bg-sunken text-ink-soft")}>
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{label}</span>
        {hint ? <span className="block truncate text-xs text-muted">{hint}</span> : null}
      </span>
      {badge ? <CountBubble count={badge} /> : null}
      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
    </Link>
  );
}

export function MobileSheets({
  sheet,
  onClose,
  data,
  current,
  pathname,
  chat,
}: {
  sheet: MobileSheet;
  onClose: () => void;
  data: ShellData;
  current?: ShellWorkspace;
  pathname: string;
  chat: ChatCounts;
}) {
  const { viewer } = data;
  const signOutWithGoodbye = useSignOut();
  const isAgency = viewer.side === "agency";
  const inbox = data.workspaces.reduce((sum, w) => sum + chatUnreadFor(w, chat), 0);
  // Every workspace page that isn't already a tab (brand kit, library, settings…).
  const extra = current ? workspaceItems(current, pathname, chat).filter((i) => !TAB_KEYS.includes(i.key)) : [];

  return (
    <>
      <BottomSheet open={sheet === "switch"} onClose={onClose} title={isAgency ? "Clients" : "Your workspaces"}>
        {isAgency ? (
          <Group>
            <Row href="/dashboard" icon={LayoutDashboard} label="All clients" hint="Dashboard" active={pathname === "/dashboard"} onNavigate={onClose} />
          </Group>
        ) : null}
        <Group title={isAgency ? `${data.workspaces.length} clients` : undefined}>
          {data.workspaces.map((w) => {
            const here = w.slug === current?.slug;
            return (
              <Link key={w.slug} href={`/w/${w.slug}`} onClick={onClose} className="flex items-center gap-3 px-3.5 py-3 transition-colors active:bg-sunken">
                <Avatar name={w.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">{w.name}</span>
                  <span className="block truncate text-xs text-muted">{isAgency ? clientSummary(w, chat) : ROLE_LABELS[w.role]}</span>
                </span>
                {here ? <Check className="size-5 shrink-0 text-accent" aria-label="Current" /> : <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />}
              </Link>
            );
          })}
        </Group>
        {isAgency && viewer.isAdmin ? (
          <Group>
            <Row href="/clients/new" icon={CirclePlus} label="New client" hint="Set up a workspace and invite them" onNavigate={onClose} />
          </Group>
        ) : null}
      </BottomSheet>

      <BottomSheet open={sheet === "more"} onClose={onClose} title="More">
        <Link href="/account" onClick={onClose} className="mt-1 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors active:bg-sunken">
          <Avatar name={viewer.name} src={viewer.avatar} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-ink">{viewer.name}</span>
            <span className="block truncate text-[13px] text-muted">{viewer.email}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </Link>

        {current && extra.length ? (
          <Group title={current.name}>
            {extra.map((i) => (
              <Row key={i.key} href={i.href} icon={i.icon} label={i.label} active={i.active} onNavigate={onClose} />
            ))}
          </Group>
        ) : null}

        {isAgency ? (
          <Group title="Agency">
            {current ? <Row href="/dashboard" icon={LayoutDashboard} label="Dashboard" hint="Every client at a glance" onNavigate={onClose} /> : null}
            {current ? <Row href="/inbox" icon={Inbox} label="Inbox" hint="All client chats" badge={inbox} onNavigate={onClose} /> : null}
            {current ? <Row href="/tasks" icon={SquareKanban} label="Team board" hint="Everyone's tasks" onNavigate={onClose} /> : null}
            <Row href="/assistant" icon={Sparkles} label="Ask Sayso" hint="Questions about your clients and work" active={pathname === "/assistant"} onNavigate={onClose} />
            {viewer.isAdmin ? <Row href="/team" icon={UsersRound} label="Team" hint="Invite staff and set roles" active={pathname === "/team"} onNavigate={onClose} /> : null}
          </Group>
        ) : null}

        <Group title="You">
          <Row href="/account" icon={UserRound} label="Account and emails" active={pathname === "/account"} onNavigate={onClose} />
          <Row href="/notifications" icon={Bell} label="Notifications" badge={data.unread} active={pathname === "/notifications"} onNavigate={onClose} />
          <Row href="/privacy" icon={ShieldCheck} label="Privacy Policy" onNavigate={onClose} />
        </Group>

        <button
          type="button"
          onClick={() => {
            onClose();
            signOutWithGoodbye(viewer.name, signOut);
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3.5 text-[15px] font-semibold text-danger transition-colors active:bg-danger-soft"
        >
          <LogOut className="size-[18px]" aria-hidden /> Sign out
        </button>
      </BottomSheet>
    </>
  );
}

/** Closes any open sheet when the page changes (e.g. browser back). */
export function useMobileSheet(pathname: string) {
  const [sheet, setSheet] = useState<MobileSheet>(null);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setSheet(null);
  }
  return [sheet, setSheet] as const;
}
