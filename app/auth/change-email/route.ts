import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readEmailChangeToken } from "@/lib/email-change";
import { findProfileByEmail } from "@/lib/invites";

/**
 * Applies an email change once the person clicks the link sent to the new
 * address. Works whether or not they're signed in on this device.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const result = (status: string) => NextResponse.redirect(new URL(`/account?email=${status}`, origin));

  const change = readEmailChangeToken(searchParams.get("token"));
  if (!change) return result("expired");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(change.userId);
  // Only while the account still has the address the change was requested from.
  if (error || !data.user || data.user.email?.toLowerCase() !== change.from) {
    return result(data?.user?.email?.toLowerCase() === change.to ? "changed" : "expired");
  }

  const taken = await findProfileByEmail(change.to);
  if (taken && taken.id !== change.userId) return result("taken");

  const { error: updateError } = await admin.auth.admin.updateUserById(change.userId, { email: change.to, email_confirm: true });
  if (updateError) {
    console.error("[account] email change failed", updateError.message);
    return result("failed");
  }
  return result("changed");
}
