"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui";
import type { WorkspaceRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Stop = { path: string; title: string; text: string };

/** The walkthrough for a client: one stop per page of their workspace. */
function stopsFor(slug: string, role: WorkspaceRole): Stop[] {
  const base = `/w/${slug}`;
  const approver = role === "approver";
  return [
    {
      path: base,
      title: "Home",
      text: approver
        ? "Start here. It shows what's happening this month, and anything waiting on you, like posts to approve."
        : "Start here. It shows what's happening this month and what the team is working on.",
    },
    {
      path: `${base}/plan`,
      title: "Monthly plan",
      text: approver
        ? "Every post planned for the month. When one is ready you'll get a notification and an email: open it, preview it, then approve it or ask for changes."
        : "Every post planned for the month. Open one to preview it exactly as it will appear.",
    },
    { path: `${base}/chat`, title: "Chat", text: "Message the whole team under Team chat, or just the agency admin under Direct. Type @ to mention someone, and attach photos or files." },
    { path: `${base}/tasks`, title: "Action items", text: "Things the team needs from you, like photos or answers. Tick each one off when it's done." },
    { path: `${base}/brand`, title: "Brand kit", text: "Your colours, fonts, tone of voice and approved answers. The team follows it for every post." },
    { path: `${base}/library`, title: "Library", text: "Product photos, videos and files in one place. Download one, a few, or everything at once, and upload your own: they go into the From the client folder." },
    { path: `${base}/offers`, title: "Offers", text: "Got a sale, a discount or a launch coming up? Tell the team here, in your own words, so they can plan posts around it." },
    {
      path: `${base}/settings`,
      title: "Team & package",
      text: "Who's on your side, and what your package includes. Updates always appear under the bell, and you choose which ones are emailed on your Account page.",
    },
  ];
}

/**
 * The walkthrough after a client's first sign-in (and from "Take the tour" on
 * the Account page). ?tour=N in the address is the stop; each stop opens its
 * page, so the sidebar shows where you are.
 */
export function Tour({ slug, role }: { slug: string; role: WorkspaceRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const stops = stopsFor(slug, role);
  const n = Number(params.get("tour"));
  const active = Number.isInteger(n) && n >= 1 && n <= stops.length;
  const stop = active ? stops[n - 1] : null;

  // Rings the sidebar link for the page being shown (see globals.css).
  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.touring = "";
    return () => {
      delete document.documentElement.dataset.touring;
    };
  }, [active]);

  const go = (to: number) => router.push(`${stops[to - 1].path}?tour=${to}`);
  const close = (finished: boolean) => {
    router.replace(pathname);
    if (finished) toast.success("That's the tour. You can take it again from your Account page.");
  };

  return (
    <AnimatePresence>
      {stop ? (
        <motion.div
          key="tour"
          role="dialog"
          aria-label="Walkthrough"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="fixed right-4 bottom-20 z-50 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-5 shadow-2xl shadow-black/15 lg:right-6 lg:bottom-6"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] text-muted tabular-nums">
              {n} of {stops.length}
            </p>
            <button type="button" onClick={() => close(false)} className="-m-1 rounded-md p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Close the tour">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={n} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}>
              <h2 className="mt-1 text-lg font-semibold text-ink">{stop.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{stop.text}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${(n / stops.length) * 100}%` }} transition={{ duration: 0.4 }} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button type="button" onClick={() => close(false)} className="text-sm text-muted hover:text-ink">
              Skip tour
            </button>
            <div className="flex gap-2">
              {n > 1 ? (
                <button type="button" onClick={() => go(n - 1)} className={buttonClass("secondary", "sm")}>
                  Back
                </button>
              ) : null}
              <button type="button" onClick={() => (n < stops.length ? go(n + 1) : close(true))} className={cn(buttonClass("primary", "sm"), "min-w-20")}>
                {n < stops.length ? "Next" : "Finish"}
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
