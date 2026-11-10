"use client";

import Link from "next/link";
import { Popover } from "radix-ui";
import type { ChatPerson } from "@/lib/chat";
import { Avatar, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Someone @mentioned in a message, as the chat knows them. */
export type MentionedPerson = ChatPerson & {
  /** The viewer themselves. */
  me: boolean;
  /** In this chat right now. */
  here?: boolean;
  /** Link to their full profile page (agency admins only), or null. */
  profileHref?: string | null;
};

/** An "@Name" in a message. Tapping it shows who that is. */
export function MentionChip({ person, label, mine }: { person: MentionedPerson; label: string; mine: boolean }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className={cn(
          "cursor-pointer rounded px-0.5 font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/50",
          mine ? "text-white focus-visible:ring-white/70" : person.me ? "bg-accent/15 text-accent-ink" : "text-accent-ink",
        )}
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="animate-pop z-50 w-[min(280px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-4 shadow-xl shadow-black/10 outline-none"
        >
          <div className="flex items-center gap-3">
            <span className="relative shrink-0">
              <Avatar name={person.name} src={person.avatar} size="lg" />
              {person.here ? <span className="absolute right-0 bottom-0 size-3 rounded-full bg-emerald-500 ring-2 ring-surface" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">
                {person.name}
                {person.me ? <span className="font-normal text-muted"> (you)</span> : null}
              </p>
              {person.jobTitle ? <p className="truncate text-[13px] text-ink-soft">{person.jobTitle}</p> : null}
              <p className="mt-0.5 text-xs text-muted">
                {person.side === "agency" ? "Agency team" : "Client"}
                {person.here && !person.me ? " · here now" : ""}
              </p>
            </div>
          </div>
          {person.profileHref ? (
            <Link href={person.profileHref} className={buttonClass("secondary", "sm", "mt-3 w-full")}>
              View profile
            </Link>
          ) : null}
          <Popover.Arrow className="fill-surface" width={14} height={7} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
