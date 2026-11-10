import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUsd, type Allowance } from "@/lib/assistant/shared";

/**
 * Sayso spending allowance for agency team members (estimated Claude API
 * cost): $2 (SAYSO_LIMIT_USD) per 24-hour period. A period starts with the
 * person's first question and lasts 24 hours; the first question after it ends
 * starts the next one. Agency admins have no limit, but their use is still
 * recorded.
 */
export const LIMIT_USD = (() => {
  const value = Number(process.env.SAYSO_LIMIT_USD);
  return Number.isFinite(value) && value > 0 ? value : 2;
})();

const PERIOD_MS = 24 * 60 * 60 * 1000;

/** The person's current 24-hour period: what they've spent and when it ends. */
export async function getAllowance(
  supabase: SupabaseClient<Database>,
  viewer: { id: string; agencyRole: "admin" | "member" | null },
): Promise<Allowance> {
  const { data } = await supabase
    .from("assistant_usage")
    .select("window_start, cost_usd")
    .eq("user_id", viewer.id)
    .gt("window_start", new Date(Date.now() - PERIOD_MS).toISOString())
    .order("window_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const spent = Number(data?.cost_usd ?? 0);
  const resetsAt = data ? new Date(new Date(data.window_start).getTime() + PERIOD_MS).toISOString() : null;
  if (viewer.agencyRole === "admin") {
    return { unlimited: true, limit: LIMIT_USD, spent, remaining: LIMIT_USD, resetsAt, exhausted: false };
  }
  const remaining = Math.max(0, LIMIT_USD - spent);
  return { unlimited: false, limit: LIMIT_USD, spent, remaining, resetsAt, exhausted: remaining <= 0 };
}

export function limitReachedMessage(allowance: Allowance): string {
  return `You've used your ${formatUsd(allowance.limit)} Sayso allowance for this 24-hour period. It renews 24 hours after your first question in the period.`;
}

/**
 * Adds a question's cost to the person's current period, starting a new
 * period if needed. Runs with the service role, because people can't write
 * to their own usage.
 */
export async function recordUsage(userId: string, cost: number): Promise<void> {
  if (!(cost > 0)) return;
  const { error } = await createAdminClient().rpc("add_assistant_usage", { p_user: userId, p_cost: Number(cost.toFixed(6)) });
  if (error) console.error("[assistant] recording usage failed", error.message);
}
