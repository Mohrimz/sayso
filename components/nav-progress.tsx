"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

/**
 * A slim progress bar along the top of the window while a page is loading.
 * It starts when someone clicks an in-app link and finishes as soon as the
 * new page's address is showing. Fast navigations never show it.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = `${pathname}?${search.toString()}`;
  // The address we were on when navigation started; loading while we're still there.
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const timers = useRef<{ show?: number; giveUp?: number }>({});
  const loading = pendingFrom !== null && pendingFrom === current;

  useEffect(() => {
    const t = timers.current;
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !anchor.href || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      const from = `${window.location.pathname}?${window.location.search.slice(1)}`;
      window.clearTimeout(t.show);
      window.clearTimeout(t.giveUp);
      // Only show the bar if the page doesn't appear almost instantly.
      t.show = window.setTimeout(() => setPendingFrom(from), 120);
      // Never leave the bar stuck if a navigation is cancelled.
      t.giveUp = window.setTimeout(() => setPendingFrom(null), 15_000);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(t.show);
      window.clearTimeout(t.giveUp);
    };
  }, []);

  return (
    <AnimatePresence>
      {loading ? (
        <motion.div
          key="nav-progress"
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25, delay: 0.2 } }}
        >
          <motion.div
            className="h-full rounded-r-full bg-gradient-to-r from-accent via-accent-2 to-ember shadow-[0_0_10px_rgba(255,91,46,0.55)]"
            initial={{ width: "0%" }}
            animate={{ width: ["0%", "35%", "60%", "80%", "92%"] }}
            exit={{ width: "100%", transition: { duration: 0.2 } }}
            transition={{ duration: 9, times: [0, 0.06, 0.25, 0.55, 1], ease: "easeOut" }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
