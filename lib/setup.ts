import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** True once the first agency admin exists (first-run setup is then disabled). */
export async function hasAgencyAdmin(): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("side", "agency")
    .eq("agency_role", "admin");
  return (count ?? 0) > 0;
}
