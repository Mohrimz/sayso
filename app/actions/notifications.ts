"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth";

/**
 * Marks one notification read. Called in the background when a notification
 * is opened: navigation never waits on it, and the bell count updates via
 * the realtime subscription in the shell.
 */
export async function markNotificationRead(id: string) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", viewer.id)
    .is("read_at", null);
}

export async function markAllRead() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", viewer.id)
    .is("read_at", null);
  refresh();
}
