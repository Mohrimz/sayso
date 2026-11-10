import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_NAME, SITE_URL } from "@/lib/env";
import { renderEmail, sendEmail } from "@/lib/email";
import type { MemberRole, UserSide } from "@/lib/types";

/**
 * Builds a one-time sign-in link that is verified on our own /auth/confirm
 * route. Unlike the default PKCE link, it works when the email is opened in a
 * different browser or app from the one that requested it (common on phones).
 */
export async function createSignInLink(opts: {
  email: string;
  type: "invite" | "magiclink";
  next: string;
  fullName?: string;
}): Promise<{ url: string; userId: string } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: opts.type,
    email: opts.email,
    options: { data: opts.fullName ? { full_name: opts.fullName } : undefined, redirectTo: SITE_URL },
  });
  const token = data?.properties?.hashed_token;
  if (error || !token || !data.user) return { error: error?.message ?? "Could not create a sign-in link" };
  const params = new URLSearchParams({ token_hash: token, type: opts.type, next: opts.next });
  return { url: `${SITE_URL}/auth/confirm?${params}`, userId: data.user.id };
}

export async function findProfileByEmail(email: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").eq("email", email.toLowerCase()).maybeSingle();
  return data;
}

type InviteInput = {
  email: string;
  name: string;
  side: UserSide;
  agencyRole?: "admin" | "member";
  workspace?: { id: string; name: string; slug: string; role: MemberRole };
  invitedBy: string;
  /** Replies to the invitation go here. */
  invitedByEmail?: string;
};

/** The invitation or "you've been added" email, worded for the person's role. */
export function inviteEmail(input: InviteInput, email: string, link: string, existing: boolean) {
  const inviter = input.invitedBy;
  const ws = input.workspace;

  if (existing && ws) {
    return {
      subject: `${inviter} added you to ${ws.name}`,
      content: {
        header: "invite" as const,
        heading: `You've been added to ${ws.name}`,
        preheader: `${inviter} gave you access to ${ws.name} on ${APP_NAME}.`,
        paragraphs: [`${inviter} gave you access to ${ws.name} on ${APP_NAME}. You'll find it in your list of clients.`],
        cta: { label: `Open ${ws.name}`, url: link },
        note: "This button signs you in. It works once and expires in an hour.",
        reason: `You received this email because ${inviter} added ${email} to ${ws.name}.`,
      },
    };
  }

  // One plain sentence on what they're being asked to do.
  const ask =
    input.side === "client" && ws
      ? ws.role === "viewer"
        ? `${inviter} has invited you to follow ${ws.name}'s content plan on ${APP_NAME} and see each post as it goes live.`
        : `${inviter} has invited you to review and approve ${ws.name}'s social media posts on ${APP_NAME} before they go live.`
      : ws
        ? `${inviter} has invited you to work on ${ws.name} with the team on ${APP_NAME}.`
        : `${inviter} has invited you to join the team on ${APP_NAME}${input.agencyRole === "admin" ? " as an admin" : ""}.`;

  return {
    subject: ws ? `${inviter} invited you to ${ws.name} on ${APP_NAME}` : `${inviter} invited you to ${APP_NAME}`,
    content: {
      header: "invite" as const,
      heading: ws ? `Join ${ws.name} on ${APP_NAME}` : `Join the team on ${APP_NAME}`,
      preheader: ask,
      paragraphs: [ask],
      cta: { label: "Accept invitation", url: link },
      note: "This invitation expires in 24 hours.",
      reason: `You received this invitation because ${inviter} invited ${email}. If you weren't expecting it, you can ignore this email.`,
    },
  };
}

/**
 * Invites a new user, or adds an existing user to a workspace, and emails them
 * a sign-in link. Callers must check the inviter's permission first.
 */
export async function inviteUser(input: InviteInput): Promise<{ link: string; existing: boolean } | { error: string }> {
  const admin = createAdminClient();
  const email = input.email.toLowerCase();
  const existing = await findProfileByEmail(email);
  const next = input.workspace ? `/w/${input.workspace.slug}` : "/";

  if (existing) {
    if (existing.side !== input.side) {
      return {
        error:
          existing.side === "agency"
            ? "That email belongs to someone on the agency team."
            : "That email belongs to a client user. Use a different email for agency staff.",
      };
    }
    if (!input.workspace) return { error: "That person is already on the team." };
  }

  let userId = existing?.id;
  let link: string;

  if (!existing) {
    const created = await createSignInLink({ email, type: "invite", next: `/welcome?next=${encodeURIComponent(next)}`, fullName: input.name });
    if ("error" in created) return { error: created.error };
    userId = created.userId;
    link = created.url;
    const { error } = await admin
      .from("profiles")
      .update({
        side: input.side,
        agency_role: input.side === "agency" ? (input.agencyRole ?? "member") : null,
        full_name: input.name || null,
      })
      .eq("id", userId);
    if (error) return { error: error.message };
  } else {
    const signIn = await createSignInLink({ email, type: "magiclink", next });
    if ("error" in signIn) return { error: signIn.error };
    link = signIn.url;
  }

  if (input.workspace && userId) {
    const { error } = await admin
      .from("workspace_members")
      .upsert({ workspace_id: input.workspace.id, user_id: userId, role: input.workspace.role }, { onConflict: "workspace_id,user_id" });
    if (error) return { error: error.message };
  }

  const { subject, content } = inviteEmail(input, email, link, Boolean(existing));
  const { html, text } = renderEmail(content);
  await sendEmail({ to: email, subject, html, text, fromName: input.invitedBy, replyTo: input.invitedByEmail });

  return { link, existing: Boolean(existing) };
}
