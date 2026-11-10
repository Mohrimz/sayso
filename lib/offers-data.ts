import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/queries";
import type { OfferView } from "@/lib/offers";

/**
 * A client's offers, newest first. `since` keeps only recent ones (for the
 * overview card). Callers must have checked workspace access first;
 * row-level security applies too.
 */
export async function getOffers(
  workspace: { id: string },
  viewer: { id: string; side: "agency" | "client" },
  { since, limit = 100 }: { since?: string; limit?: number } = {},
): Promise<OfferView[]> {
  const supabase = await createClient();
  let query = supabase
    .from("offers")
    .select("id, message, created_by, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since) query = query.gte("created_at", since);
  const { data } = await query;
  const rows = data ?? [];
  const people = await getPeople(rows.map((r) => r.created_by));

  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    createdBy: r.created_by,
    authorName: (r.created_by ? people.get(r.created_by)?.name : null) ?? "A former member",
    createdAt: r.created_at,
    canRemove: viewer.side === "client" && r.created_by === viewer.id,
  }));
}
