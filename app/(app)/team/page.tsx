import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/avatar";
import { isPlaceholderEmail } from "@/lib/placeholder-email";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { InviteForm } from "@/components/invite-form";
import { Sheet } from "@/components/sheet";
import { RemoveMemberButton } from "@/components/remove-member-button";
import { SeenStatus } from "@/components/seen-status";
import { inviteAgencyUser, removeAgencyMember, setAgencyRole, setMemberClients } from "@/app/actions/team";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const [{ data: people }, { data: memberships }, { data: workspaces }, { data: activity }, { data: clientPeople }, { data: clientSeats }] = await Promise.all([
    supabase.from("profiles").select("*").eq("side", "agency").order("full_name"),
    supabase.from("workspace_members").select("user_id, workspace_id").eq("role", "team_member"),
    supabase.from("workspaces").select("id, name, slug, status").order("name"),
    supabase.from("user_activity").select("user_id, last_seen_at"),
    supabase.from("profiles").select("id, full_name, email, job_title, avatar_path, onboarded_at").eq("side", "client"),
    supabase.from("workspace_members").select("user_id, workspace_id, role").in("role", ["approver", "viewer"]),
  ]);
  const wsName = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
  // When each person last used Sayso. Only agency admins can read other people's.
  const lastSeen = new Map((activity ?? []).map((a) => [a.user_id, a.last_seen_at]));
  // Archived clients are only listed for people still assigned to them.
  const clientsFor = (assignedIds: string[]) => (workspaces ?? []).filter((w) => w.status !== "archived" || assignedIds.includes(w.id));
  // People on the client side, most recently active first (never signed in last).
  const wsById = new Map((workspaces ?? []).map((w) => [w.id, w]));
  const clients = (clientPeople ?? [])
    .map((p) => ({
      ...p,
      name: p.full_name?.trim() || p.email,
      seenAt: lastSeen.get(p.id) ?? null,
      seats: (clientSeats ?? []).flatMap((m) => {
        const ws = m.user_id === p.id ? wsById.get(m.workspace_id) : undefined;
        return ws ? [{ name: ws.name, slug: ws.slug, role: m.role === "approver" ? "Approver" : "Viewer" }] : [];
      }),
    }))
    .sort((a, b) => (b.seenAt ?? "").localeCompare(a.seenAt ?? "") || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Your agency team and everyone on the client side, with when each of them last used Sayso. Team members see only the clients you assign them here." />

      <Card>
        <CardHeader title="Invite a teammate" />
        <div className="p-4 sm:p-5">
          <InviteForm
            action={inviteAgencyUser}
            hidden={{}}
            roles={[
              { value: "member", label: "Team member" },
              { value: "admin", label: "Admin" },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={`Agency team · ${(people ?? []).length}`} />
        <ul className="divide-y divide-line">
          {(people ?? []).map((p) => {
            const name = p.full_name || p.email;
            const assignedIds = (memberships ?? []).filter((m) => m.user_id === p.id).map((m) => m.workspace_id);
            const assigned = assignedIds.map((id) => wsName.get(id)).filter(Boolean);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Link href={`/people/${p.id}`} className="shrink-0 rounded-full" aria-label={`View ${name}'s profile`}>
                  <Avatar name={name} src={avatarUrl(p.avatar_path)} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    <Link href={`/people/${p.id}`} className="hover:text-accent-ink hover:underline">
                      {name}
                    </Link>{" "}
                    {p.id === viewer.id ? <span className="font-normal text-muted">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {p.job_title ? `${p.job_title} · ` : ""}
                    {p.email}
                    {p.agency_role === "member" ? ` · ${assigned.length ? assigned.join(", ") : "not assigned to any client"}` : " · all clients"}
                  </p>
                  <SeenStatus iso={lastSeen.get(p.id) ?? null} className="mt-1" />
                </div>
                {p.id === viewer.id ? (
                  <Badge tone="purple">Admin</Badge>
                ) : (
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    {p.agency_role === "member" ? (
                      <Sheet
                        title={`Clients for ${name}`}
                        description="They'll see and work on the clients you tick. Admins see every client."
                        triggerLabel={assigned.length ? `Clients · ${assigned.length}` : "Assign clients"}
                        triggerVariant={assigned.length ? "secondary" : "primary"}
                      >
                        {clientsFor(assignedIds).length ? (
                          <ActionForm action={setMemberClients} className="space-y-4">
                            <input type="hidden" name="user_id" value={p.id} />
                            <fieldset>
                              <legend className="sr-only">Clients</legend>
                              <ul className="divide-y divide-line rounded-xl border border-line">
                                {clientsFor(assignedIds).map((w) => (
                                  <li key={w.id}>
                                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-ink hover:bg-sunken">
                                      <input
                                        type="checkbox"
                                        name="workspace_ids"
                                        value={w.id}
                                        defaultChecked={assignedIds.includes(w.id)}
                                        className="size-4 rounded border-line-strong accent-accent"
                                      />
                                      <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                                      {w.status !== "active" ? <span className="text-xs text-muted capitalize">{w.status}</span> : null}
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            </fieldset>
                            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                          </ActionForm>
                        ) : (
                          <p className="text-sm text-muted">There are no clients yet. Add one first, then assign it here.</p>
                        )}
                      </Sheet>
                    ) : null}
                    <ActionForm action={setAgencyRole} showSuccess={false} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={p.id} />
                      <select name="role" defaultValue={p.agency_role ?? "member"} className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs" aria-label={`Role for ${name}`}>
                        <option value="member">Team member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <SubmitButton variant="ghost" size="sm" pendingLabel="…">Save</SubmitButton>
                    </ActionForm>
                    <RemoveMemberButton
                      action={removeAgencyMember}
                      fields={{ user_id: p.id }}
                      name={name}
                      title={`Remove ${name} from the team?`}
                      description="They'll lose access to Sayso straight away and won't be able to sign in. Their past work stays, shown as “Former member”. You can invite them again later."
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title={`Clients · ${clients.length}`} description="Everyone on the client side and when they last used Sayso. Add or remove them on each client's Team & package page." />
        {clients.length ? (
          <ul className="divide-y divide-line">
            {clients.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Link href={`/people/${p.id}`} className="shrink-0 rounded-full" aria-label={`View ${p.name}'s profile`}>
                  <Avatar name={p.name} src={avatarUrl(p.avatar_path)} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    <Link href={`/people/${p.id}`} className="hover:text-accent-ink hover:underline">
                      {p.name}
                    </Link>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {p.job_title ? `${p.job_title} · ` : ""}
                    {p.email}
                    {isPlaceholderEmail(p.email) ? " (temporary login)" : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <SeenStatus iso={p.seenAt} />
                    {!p.onboarded_at && p.seenAt ? <span className="text-xs text-amber-700">Setup not finished</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone="blue">Client</Badge>
                  {p.seats.length ? (
                    p.seats.map((s) => (
                      <Link key={s.slug} href={`/w/${s.slug}/settings`} className="text-xs text-muted hover:text-ink hover:underline">
                        {s.name} · {s.role}
                      </Link>
                    ))
                  ) : (
                    <span className="text-xs text-faint">Not on any client</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted sm:px-5">No client logins yet. Invite people from a client&apos;s Team & package page.</p>
        )}
      </Card>
    </div>
  );
}
