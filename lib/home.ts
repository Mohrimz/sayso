import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Where a user should land after signing in: agency dashboard, or the client's workspace. */
export async function homeFor(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data: profile } = await supabase.from("profiles").select("side").eq("id", userId).maybeSingle();
  if (profile?.side === "agency") return "/dashboard";
  const { data: workspaces } = await supabase.from("workspaces").select("slug").neq("status", "archived").limit(2);
  return workspaces?.length === 1 ? `/w/${workspaces[0].slug}` : "/";
}
