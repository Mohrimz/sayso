import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
import { homeFor } from "@/lib/home";
import { arrivalUrl } from "@/lib/arrival";

const TYPES: EmailOtpType[] = ["invite", "magiclink", "recovery", "email", "signup", "email_change"];

/** Verifies a one-time link from an invite or sign-in email and starts the session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      const target = next === "/" ? await homeFor(supabase, data.user.id) : next;
      // Through the welcome animation: "Welcome to Sayso" for invites, "Welcome back" otherwise.
      return NextResponse.redirect(new URL(arrivalUrl(target, type === "invite" ? "new" : "back"), origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
