"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const EVERY_MS = 2 * 60 * 1000;

/**
 * Tells Sayso the signed-in person is here, so admins can see "Active now" or
 * "Last seen 2h ago". It runs when the page opens, when the tab comes back into
 * view, and every two minutes while it's visible. The database ignores calls
 * more often than that, and records its own clock, not the browser's.
 */
export function LastSeen() {
  useEffect(() => {
    let last = 0;
    const touch = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < EVERY_MS) return;
      last = Date.now();
      void (async () => {
        try {
          await createClient().rpc("touch_last_seen");
        } catch {
          // Not important enough to bother anyone about.
        }
      })();
    };
    touch();
    const timer = window.setInterval(touch, EVERY_MS);
    document.addEventListener("visibilitychange", touch);
    window.addEventListener("focus", touch);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
      window.removeEventListener("focus", touch);
    };
  }, []);
  return null;
}
