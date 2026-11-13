import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Task work an admin marked as done on a post. The person who made it sends
 * the post to the client (send_approved_work); the admin only sees whether it
 * has gone yet.
 */
export type ApprovedWork = {
  /** Who made the work, and sends it to the client. */
  senderId: string;
  reviewerId: string | null;
  reviewedAt: string;
  /** Approved and still waiting to be sent to the client. */
  pending: boolean;
  /** When it went to the client after being approved, if it has. */
  sentAt: string | null;
};

const later = (a: string | null, b: string) => Boolean(a && new Date(a).getTime() >= new Date(b).getTime());

/**
 * The latest approved task work on a post, or null. Agency only: row-level
 * security hides task submissions from clients. `versions` is the post's
 * versions, newest first.
 */
export async function getApprovedWork(
  supabase: Supabase,
  item: { id: string; status: string; sent_for_approval_at: string | null },
  versions: { id: string; media: unknown }[],
): Promise<ApprovedWork | null> {
  const { data: sub } = await supabase
    .from("task_submissions")
    .select("submitted_by, reviewed_by, reviewed_at, version_id")
    .eq("content_item_id", item.id)
    .eq("decision", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // No maker left (their account was removed): an admin sends it as usual.
  if (!sub?.reviewed_at || !sub.submitted_by) return null;

  const sentAt = later(item.sent_for_approval_at, sub.reviewed_at) ? item.sent_for_approval_at : null;
  // Still the approved files: a new upload since means it needs reviewing again.
  const approved = versions.find((v) => v.id === sub.version_id);
  const sameFiles = Boolean(approved && versions[0] && JSON.stringify(versions[0].media) === JSON.stringify(approved.media));
  return {
    senderId: sub.submitted_by,
    reviewerId: sub.reviewed_by,
    reviewedAt: sub.reviewed_at,
    pending: !sentAt && sameFiles && (item.status === "draft" || item.status === "internal_review"),
    sentAt,
  };
}

/**
 * For the task lists: each task's approved post and whether it has gone to the
 * client since it was approved. Keyed by task id.
 */
export async function getSentStatus(
  supabase: Supabase,
  rounds: { task_id: string; decision: string | null; content_item_id: string | null; reviewed_at: string | null; submitted_by: string | null }[],
): Promise<Map<string, { postId: string; senderId: string | null; sent: boolean }>> {
  // The latest round per task, when it was approved for a post.
  const latest = new Map<string, (typeof rounds)[number]>();
  for (const r of rounds) if (!latest.has(r.task_id)) latest.set(r.task_id, r);
  const approved = [...latest.values()].filter((r) => r.decision === "approved" && r.content_item_id && r.reviewed_at);
  const out = new Map<string, { postId: string; senderId: string | null; sent: boolean }>();
  if (!approved.length) return out;
  const { data: items } = await supabase
    .from("content_items")
    .select("id, sent_for_approval_at")
    .in("id", [...new Set(approved.map((r) => r.content_item_id!))]);
  const sentAt = new Map((items ?? []).map((i) => [i.id, i.sent_for_approval_at]));
  for (const r of approved) {
    if (!sentAt.has(r.content_item_id!)) continue;
    out.set(r.task_id, { postId: r.content_item_id!, senderId: r.submitted_by, sent: later(sentAt.get(r.content_item_id!) ?? null, r.reviewed_at!) });
  }
  return out;
}
