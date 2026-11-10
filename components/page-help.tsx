"use client";

import { Popover } from "radix-ui";
import { Check, CircleHelp } from "lucide-react";
import type { Insight } from "@/lib/insights";

/**
 * "Help" button that explains the current page. Nothing is shown until the
 * person asks for it.
 */
export function PageHelp({ insight }: { insight: Insight }) {
  if (!insight.title) return null;
  return (
    <Popover.Root>
      <Popover.Trigger
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft hover:bg-sunken hover:text-ink data-[state=open]:bg-accent-soft data-[state=open]:text-accent-ink"
        aria-label="Help with this page"
      >
        <CircleHelp className="size-[18px]" aria-hidden />
        <span className="hidden sm:inline">Help</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="animate-pop z-50 w-[min(380px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-5 shadow-xl shadow-black/10 outline-none"
        >
          <p className="text-[11px] font-semibold tracking-wider text-accent uppercase">About this page</p>
          <p className="mt-1 text-base font-semibold text-ink">{insight.title}</p>
          <p className="mt-1 text-sm text-ink-soft">{insight.summary}</p>
          {insight.points.length ? (
            <ul className="mt-4 space-y-2.5">
              {insight.points.map(([term, text]) => (
                <li key={term} className="flex gap-2.5 text-[13px] leading-snug text-ink-soft">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                    <Check className="size-3 text-accent" aria-hidden />
                  </span>
                  <span>
                    <span className="font-semibold text-ink">{term}:</span> {text}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <Popover.Arrow className="fill-surface" width={14} height={7} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
