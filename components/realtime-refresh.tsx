"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Watch = { table: "comments" | "approvals" | "content_items" | "notifications" | "messages" | "offers"; filter?: string };

/**
 * Re-renders the page when watched rows change, so new comments, approvals
 * and status changes appear without a manual refresh. Row-level security
 * applies to what each subscriber receives.
 */
export function RealtimeRefresh({ channel, watch }: { channel: string; watch: Watch[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = JSON.stringify(watch);

  useEffect(() => {
    const supabase = createClient();
    const watched: Watch[] = JSON.parse(key);
    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    void (async () => {
      // Join as the signed-in user. Without this a fresh page load joins as
      // "anon", and filtered subscriptions are rejected by row-level security.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      let next = supabase.channel(channel);
      for (const w of watched) {
        next = next.on(
          "postgres_changes",
          { event: "*", schema: "public", table: w.table, ...(w.filter ? { filter: w.filter } : {}) },
          () => {
            // Coalesce bursts (e.g. an approval also inserts a comment).
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => router.refresh(), 250);
          },
        );
      }
      ch = next.subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [channel, key, router]);

  return null;
}
