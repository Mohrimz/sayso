"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { SaysoChat } from "./sayso-chat";
import { APP_NAME } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * The corner button that opens Sayso in a pop-up. Hidden on the full screen
 * page and in chats, where it would cover the message box.
 */
export function SaysoLauncher({ userId, firstName }: { userId: string; firstName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hidden = pathname === "/assistant" || /^\/w\/[^/]+\/chat(\/|$)/.test(pathname);
  const showPanel = open && !hidden;

  useEffect(() => {
    if (!showPanel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPanel]);

  if (hidden) return null;

  return (
    <>
      <AnimatePresence>
        {showPanel ? (
          <motion.div
            key="sayso-panel"
            role="dialog"
            aria-label={APP_NAME}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            style={{ transformOrigin: "bottom right" }}
            className={cn(
              // Phones: full screen, over the tab bar.
              "fixed inset-0 z-50 overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
              // Tablets and unfolded foldables: a pop-up above the corner button, which sits
              // above the tab bar, and below the 56px top bar.
              "sm:inset-auto sm:right-6 sm:bottom-[calc(140px+env(safe-area-inset-bottom))] sm:h-[min(660px,calc(100dvh-204px-env(safe-area-inset-bottom)))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-line sm:p-0 sm:shadow-2xl sm:shadow-ink/15",
              // Desktop: no tab bar.
              "lg:bottom-24 lg:h-[min(660px,calc(100dvh-120px))]",
            )}
          >
            <SaysoChat variant="panel" userId={userId} firstName={firstName} onClose={() => setOpen(false)} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={showPanel}
        aria-label={showPanel ? `Close ${APP_NAME}` : `Ask ${APP_NAME}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        className={cn(
          "fixed right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-linear-to-br from-accent to-accent-2 px-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 sm:right-6 sm:px-4",
          // Below lg the app's tab bar (56px + safe area) runs along the bottom of every page.
          "bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-6",
          showPanel && "max-sm:hidden",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={showPanel ? "close" : "open"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex"
          >
            {showPanel ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
          </motion.span>
        </AnimatePresence>
        <span className={cn(showPanel ? "hidden" : "hidden sm:inline")}>Ask {APP_NAME}</span>
      </motion.button>
    </>
  );
}
