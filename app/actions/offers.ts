"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findWorkspaceAccess } from "@/lib/auth";
import { deliverNotificationsLater, done, fail, friendlyError, str } from "@/lib/action-helpers";
import { isUuid } from "@/lib/chat";
import { OFFER_MAX_LENGTH, offerPreview } from "@/lib/offers";
import type { ActionState } from "./types";

/** Agency admins plus the team members on this client. */
async function agencyRecipients(workspaceId: string) {
  const admin = createAdminClient();
  const [{ data: admins }, { data: team }] = await Promise.all([
    admin.from("profiles").select("id").eq("side", "agency").eq("agency_role", "admin"),
    admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "team_member"),
  ]);
  return [...new Set([...(admins ?? []).map((a) => a.id), ...(team ?? []).map((t) => t.user_id)])];
}

/**
 * The client shares an offer (a sale, a discount, a launch) as one message.
 * Client side only (also enforced in the database). The agency team is told
 * by notification and email.
 */
export async function shareOffer(_: ActionState, fd: FormData): Promise<ActionState> {
  const workspaceId = str(fd, "workspace_id");
  if (!isUuid(workspaceId)) return fail("Client not found.");
  const access = await findWorkspaceAccess("id", workspaceId);
  if (!access?.can.isClient) return fail("Offers are shared by the client team.");
  const message = str(fd, "message").slice(0, OFFER_MAX_LENGTH);
  if (!message) return fail("Write the offer first.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .insert({ workspace_id: workspaceId, message, created_by: access.viewer.id })
    .select("id")
    .single();
  if (error || !data) return fail(friendlyError(error));

  const recipients = await agencyRecipients(workspaceId);
  if (recipients.length) {
    await createAdminClient()
      .from("notifications")
      .insert(
        recipients.map((user_id) => ({
          user_id,
          workspace_id: workspaceId,
          type: "offer",
          title: `${access.workspace.name} shared an offer`,
          body: offerPreview(message, 300),
          link: `/w/${access.workspace.slug}/offers#offer-${data.id}`,
        })),
      );
    deliverNotificationsLater();
  }

  refresh();
  return done("Shared with the team.");
}

/** The person who posted an offer takes it down. */
export async function deleteOffer(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "offer_id");
  if (!isUuid(id)) return fail("Offer not found.");
  const supabase = await createClient();
  const { data: offer } = await supabase.from("offers").select("workspace_id").eq("id", id).maybeSingle();
  if (!offer) return fail("Offer not found.");
  const access = await findWorkspaceAccess("id", offer.workspace_id);
  if (!access) return fail("Offer not found.");

  const { data: gone, error } = await supabase.from("offers").delete().eq("id", id).select("id");
  if (error) return fail(friendlyError(error));
  if (!gone?.length) return fail("Only the person who shared this offer can remove it.");

  // Unread notifications about it would lead nowhere now.
  await createAdminClient()
    .from("notifications")
    .delete()
    .eq("type", "offer")
    .eq("link", `/w/${access.workspace.slug}/offers#offer-${id}`)
    .is("read_at", null);

  refresh();
  return done("Offer removed.");
}
