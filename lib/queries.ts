import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseMedia, signMedia, type SignedMedia } from "@/lib/media";
import { avatarUrl } from "@/lib/avatar";
import type { MemberRole, UserSide } from "@/lib/types";

export type PersonLite = {
  id: string;
  name: string;
  email: string;
  side: UserSide;
  /** Public profile picture URL, or null. */
  avatar: string | null;
  jobTitle: string | null;
  phone: string | null;
};

const PERSON_COLUMNS = "id, full_name, email, side, avatar_path, job_title, phone";

function toPerson(p: {
  id: string;
  full_name: string | null;
  email: string;
  side: UserSide;
  avatar_path: string | null;
  job_title: string | null;
  phone: string | null;
}): PersonLite {
  return {
    id: p.id,
    name: p.full_name || p.email.split("@")[0],
    email: p.email,
    side: p.side,
    avatar: avatarUrl(p.avatar_path),
    jobTitle: p.job_title,
    phone: p.phone,
  };
}

/** Names for a set of user ids (only profiles the viewer may see are returned). */
export async function getPeople(ids: (string | null | undefined)[]): Promise<Map<string, PersonLite>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PERSON_COLUMNS).in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, toPerson(p)]));
}

export type MemberRow = PersonLite & { role: MemberRole };

export const getWorkspaceMembers = cache(async (workspaceId: string): Promise<MemberRow[]> => {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId);
  const people = await getPeople((members ?? []).map((m) => m.user_id));
  return (members ?? [])
    .map((m) => {
      const p = people.get(m.user_id);
      return p ? { ...p, role: m.role } : null;
    })
    .filter((m): m is MemberRow => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** Agency people who can be assigned work on a client: admins plus assigned team members. */
export const getAgencyAssignees = cache(async (workspaceId: string): Promise<(PersonLite & { isAdmin: boolean })[]> => {
  const supabase = await createClient();
  const { data: agency } = await supabase.from("profiles").select(`${PERSON_COLUMNS}, agency_role`).eq("side", "agency");
  const members = await getWorkspaceMembers(workspaceId);
  const assigned = new Set(members.filter((m) => m.role === "team_member").map((m) => m.id));
  return (agency ?? [])
    .filter((p) => p.agency_role === "admin" || assigned.has(p.id))
    .map((p) => ({ ...toPerson(p), isAdmin: p.agency_role === "admin" }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

export async function getPlanByMonth(workspaceId: string, month: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_plans")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("month", `${month}-01`)
    .maybeSingle();
  return data;
}

/**
 * First media file of the latest version each viewer can see (clients only
 * get versions sent to them), signed for display.
 */
export async function getThumbnails(itemIds: string[]): Promise<Map<string, SignedMedia>> {
  if (!itemIds.length) return new Map();
  const supabase = await createClient();
  const { data: versions } = await supabase
    .from("content_versions")
    .select("content_item_id, version_number, media")
    .in("content_item_id", itemIds)
    .order("version_number", { ascending: false });
  const latest = new Map<string, ReturnType<typeof parseMedia>[number]>();
  for (const v of versions ?? []) {
    if (latest.has(v.content_item_id)) continue;
    const first = parseMedia(v.media)[0];
    if (first) latest.set(v.content_item_id, first);
  }
  const ids = [...latest.keys()];
  const signed = await signMedia(ids.map((id) => latest.get(id)!));
  const bySrcName = new Map<string, SignedMedia>();
  ids.forEach((id) => {
    const file = latest.get(id)!;
    const match = signed.find((s) => (file.path ? s.path === file.path : s.url === file.url));
    if (match) bySrcName.set(id, match);
  });
  return bySrcName;
}
