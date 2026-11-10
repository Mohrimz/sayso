import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceMembers } from "@/lib/queries";
import { ROLE_LABELS } from "@/lib/permissions";
import { QUOTA_LABELS } from "@/lib/content";
import { formatDate } from "@/lib/dates";
import { asArray, asObject, type ApprovalRuleEntry, type Baseline, type Quotas, type SocialAccount } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { InviteForm } from "@/components/invite-form";
import { RemoveMemberButton } from "@/components/remove-member-button";
import { Tabs, TabsContent } from "@/components/tabs";
import { InstagramResultsCard } from "@/components/instagram-results-settings";
import {
  assignTeamMember,
  changeMemberRole,
  inviteMember,
  removeMember,
  updateGoalsAndRules,
  updateWorkspaceProfile,
  updateWorkspaceScope,
} from "@/app/actions/workspaces";

const TIME_ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export default async function SettingsPage({ params, searchParams }: PageProps<"/w/[slug]/settings">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { workspace, can, role, viewer } = await getWorkspaceAccess(slug);
  if (!can.isAgency && !can.seeBilling) redirect(`/w/${workspace.slug}`);
  const supabase = await createClient();
  const admin = can.manageWorkspace;

  const [members, { data: pkg }, { data: agencyPeople }] = await Promise.all([
    getWorkspaceMembers(workspace.id),
    can.seeBilling ? supabase.from("packages").select("*").eq("workspace_id", workspace.id).maybeSingle() : Promise.resolve({ data: null }),
    admin
      ? supabase.from("profiles").select("id, full_name, email").eq("side", "agency").eq("agency_role", "member").order("full_name")
      : Promise.resolve({ data: [] }),
  ]);
  const quotas = asObject<Quotas>(workspace.quotas);
  const baseline = asObject<Baseline>(workspace.baseline);
  const rules = asArray<ApprovalRuleEntry>(workspace.rules);
  const socials = asArray<SocialAccount>(workspace.social_accounts);
  const team = members.filter((m) => m.role === "team_member");
  const clients = members.filter((m) => m.role !== "team_member");
  const unassigned = (agencyPeople ?? []).filter((p) => !team.some((t) => t.id === p.id));
  const ro = !admin;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {admin ? "Settings" : can.isAgency ? "Client profile" : "Team and package"}
        </h1>
        {sp.created ? (
          <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
            Workspace created. Next: invite the client under People, then share this month&apos;s plan.
          </p>
        ) : null}
      </div>

      <Tabs
        defaultValue={sp.created ? "people" : can.isAgency ? "profile" : "package"}
        tabs={[
          ...(can.isAgency ? [{ value: "profile", label: "Profile" }] : []),
          { value: "package", label: "Package" },
          ...(can.isAgency ? [{ value: "goals", label: "Goals & rules" }] : []),
          { value: "people", label: "People", count: members.length },
        ]}
      >
      {can.isAgency ? (
        <TabsContent value="profile">
        <Card>
          <CardHeader title="Profile" description="Who the client is and how approvals work." />
          <ActionForm action={updateWorkspaceProfile} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <input type="hidden" name="workspace_id" value={workspace.id} />
            <fieldset disabled={ro} className="contents">
              <div>
                <label className="label" htmlFor="name">Business name</label>
                <input id="name" name="name" defaultValue={workspace.name} required className="field" />
              </div>
              <div>
                <label className="label" htmlFor="website">Website</label>
                <input id="website" name="website" type="url" defaultValue={workspace.website ?? ""} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="time_zone">Time zone</label>
                <input id="time_zone" name="time_zone" defaultValue={workspace.time_zone} list="tz-list" className="field" />
                <datalist id="tz-list">
                  {TIME_ZONES.map((tz) => <option key={tz} value={tz} />)}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={workspace.status} className="field">
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="main_contact_name">Main contact</label>
                <input id="main_contact_name" name="main_contact_name" defaultValue={workspace.main_contact_name ?? ""} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="main_contact_email">Main contact email</label>
                <input id="main_contact_email" name="main_contact_email" type="email" defaultValue={workspace.main_contact_email ?? ""} className="field" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="social_accounts">Social accounts</label>
                <textarea
                  id="social_accounts"
                  name="social_accounts"
                  rows={3}
                  defaultValue={socials.map((s) => [s.platform, s.handle, s.url].filter(Boolean).join(" | ")).join("\n")}
                  className="field font-mono text-[13px]"
                  placeholder={"instagram | @bloombakery | https://instagram.com/bloombakery"}
                />
                <p className="hint">One per line: platform | handle | link.</p>
              </div>
              <fieldset className="sm:col-span-2">
                <legend className="label">Approval rule</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { v: "any", t: "One approval is enough", d: "Any approver can approve on behalf of the client." },
                    { v: "all", t: "Every approver must approve", d: "Content waits until all approvers have signed off." },
                  ].map((o) => (
                    <label key={o.v} className="flex cursor-pointer gap-3 rounded-lg border border-line-strong p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                      <input type="radio" name="approval_rule" value={o.v} defaultChecked={workspace.approval_rule === o.v} className="mt-1" />
                      <span>
                        <span className="block text-sm font-medium text-ink">{o.t}</span>
                        <span className="block text-xs text-muted">{o.d}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {admin ? (
                <div className="sm:col-span-2">
                  <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
                </div>
              ) : null}
            </fieldset>
          </ActionForm>
        </Card>
        <InstagramResultsCard
          workspaceId={workspace.id}
          instagram={workspace.instagram_account_id}
          facebook={workspace.facebook_page_id}
          canEdit={admin}
        />
        </TabsContent>
      ) : null}

      <TabsContent value="package">
      <Card>
        <CardHeader title="Package and scope" description="Monthly deliverables are tracked against these quotas." />
        {admin ? (
          <ActionForm action={updateWorkspaceScope} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <input type="hidden" name="workspace_id" value={workspace.id} />
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3 lg:grid-cols-5">
              {(["feed_post", "reel", "story", "report"] as const).map((k) => (
                <div key={k}>
                  <label className="label" htmlFor={`quota_${k}`}>{QUOTA_LABELS[k]}</label>
                  <input id={`quota_${k}`} name={`quota_${k}`} type="number" min={0} defaultValue={quotas[k] ?? 0} className="field" />
                </div>
              ))}
              <div>
                <label className="label" htmlFor="revision_rounds">Revision rounds</label>
                <input id="revision_rounds" name="revision_rounds" type="number" min={0} defaultValue={workspace.revision_rounds} className="field" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="service_name">Service name</label>
              <input id="service_name" name="service_name" defaultValue={pkg?.service_name ?? ""} className="field" />
            </div>
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <div>
                <label className="label" htmlFor="monthly_fee">Monthly fee</label>
                <input id="monthly_fee" name="monthly_fee" type="number" step="0.01" min={0} defaultValue={pkg?.monthly_fee ?? ""} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="currency">Currency</label>
                <input id="currency" name="currency" maxLength={3} defaultValue={pkg?.currency ?? "USD"} className="field uppercase" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="start_date">Start date</label>
              <input id="start_date" name="start_date" type="date" defaultValue={pkg?.start_date ?? ""} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="term_months">Contract length (months)</label>
              <input id="term_months" name="term_months" type="number" min={1} defaultValue={pkg?.term_months ?? ""} className="field" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="package_notes">Notes</label>
              <textarea id="package_notes" name="package_notes" rows={2} defaultValue={pkg?.notes ?? ""} className="field" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Saving…">Save package</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <dl className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
            {(["feed_post", "reel", "story", "report"] as const).map((k) =>
              quotas[k] ? (
                <div key={k}>
                  <dt className="text-[13px] text-muted">{QUOTA_LABELS[k]}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{quotas[k]} / month</dd>
                </div>
              ) : null,
            )}
            <div>
              <dt className="text-[13px] text-muted">Revision rounds per item</dt>
              <dd className="text-lg font-semibold tabular-nums">{workspace.revision_rounds}</dd>
            </div>
            {pkg ? (
              <>
                <div>
                  <dt className="text-[13px] text-muted">Service</dt>
                  <dd className="text-sm font-medium">{pkg.service_name || "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Monthly fee</dt>
                  <dd className="text-sm font-medium">{formatMoney(pkg.monthly_fee, pkg.currency)}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Contract</dt>
                  <dd className="text-sm font-medium">
                    {pkg.term_months ? `${pkg.term_months} months` : "Rolling"}
                    {pkg.start_date ? ` from ${formatDate(pkg.start_date)}` : ""}
                  </dd>
                </div>
                {pkg.notes ? (
                  <div className="sm:col-span-3">
                    <dt className="text-[13px] text-muted">Notes</dt>
                    <dd className="text-sm">{pkg.notes}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
          </dl>
        )}
      </Card>
      </TabsContent>

      {can.isAgency ? (
        <TabsContent value="goals">
        <Card>
          <CardHeader title="Goals, rules and starting baseline" />
          <ActionForm action={updateGoalsAndRules} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <input type="hidden" name="workspace_id" value={workspace.id} />
            <fieldset disabled={ro} className="contents">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="goals_focus">Current focus</label>
                <textarea id="goals_focus" name="goals_focus" rows={2} defaultValue={workspace.goals_focus ?? ""} className="field" placeholder="e.g. Awareness first, then sales" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="success_measures">Agreed success measures</label>
                <textarea id="success_measures" name="success_measures" rows={2} defaultValue={workspace.success_measures ?? ""} className="field" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="all_approver_tags">Tags that need every approver</label>
                <input id="all_approver_tags" name="all_approver_tags" defaultValue={rules.map((r) => r.tag).join(", ")} className="field" placeholder="AI-generated, uses customer review" />
                <p className="hint">Content with any of these tags waits for sign-off from every approver, even if one approval is normally enough.</p>
              </div>
              <div>
                <label className="label" htmlFor="baseline_recorded_on">Baseline recorded on</label>
                <input id="baseline_recorded_on" name="baseline_recorded_on" type="date" defaultValue={baseline.recorded_on ?? ""} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="baseline_followers">Followers on day one</label>
                <textarea
                  id="baseline_followers"
                  name="baseline_followers"
                  rows={2}
                  defaultValue={Object.entries(baseline.followers ?? {}).map(([p, n]) => `${p}: ${n}`).join("\n")}
                  className="field font-mono text-[13px]"
                  placeholder={"instagram: 2140\nfacebook: 860"}
                />
              </div>
              <div>
                <label className="label" htmlFor="baseline_reach">Monthly reach</label>
                <input id="baseline_reach" name="baseline_reach" type="number" defaultValue={baseline.monthly_reach ?? ""} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="baseline_engagement">Engagement rate (%)</label>
                <input id="baseline_engagement" name="baseline_engagement" type="number" step="0.1" defaultValue={baseline.engagement_rate ?? ""} className="field" />
              </div>
              {admin ? (
                <div className="sm:col-span-2">
                  <SubmitButton pendingLabel="Saving…">Save goals and rules</SubmitButton>
                </div>
              ) : null}
            </fieldset>
          </ActionForm>
        </Card>
        </TabsContent>
      ) : null}

      <TabsContent value="people">
      <Card>
        <CardHeader title="People" description="Who can see this workspace." />
        <ul className="divide-y divide-line">
          {[...team, ...clients].map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={m.name} src={m.avatar} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {admin ? (
                    <Link href={`/people/${m.id}`} className="hover:text-accent-ink hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}{" "}
                  {m.id === viewer.id ? <span className="font-normal text-muted">(you)</span> : null}
                </p>
                <p className="truncate text-xs text-muted">{[m.jobTitle, m.email, m.phone].filter(Boolean).join(" · ")}</p>
              </div>
              {can.inviteMembers && m.role !== "team_member" && m.id !== viewer.id ? (
                <ActionForm action={changeMemberRole} showSuccess={false} className="flex items-center gap-1">
                  <input type="hidden" name="workspace_id" value={workspace.id} />
                  <input type="hidden" name="user_id" value={m.id} />
                  <select name="role" defaultValue={m.role} className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs" aria-label={`Role for ${m.name}`}>
                    <option value="approver">Approver</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <SubmitButton variant="ghost" size="sm" pendingLabel="…">Save</SubmitButton>
                </ActionForm>
              ) : (
                <Badge tone={m.role === "team_member" ? "purple" : m.role === "approver" ? "blue" : "gray"}>{ROLE_LABELS[m.role]}</Badge>
              )}
              {(admin || (role === "approver" && m.role !== "team_member")) && m.id !== viewer.id ? (
                <RemoveMemberButton
                  action={removeMember}
                  fields={{ workspace_id: workspace.id, user_id: m.id }}
                  name={m.name}
                  title={`Remove ${m.name} from ${workspace.name}?`}
                  description={
                    m.role === "team_member"
                      ? `They'll stop seeing ${workspace.name}, but stay on the agency team.`
                      : `They'll lose access to ${workspace.name} straight away. If it's the only client they belong to, their Sayso login is deleted too, so they can't sign in.`
                  }
                />
              ) : null}
            </li>
          ))}
          {!members.length ? <li className="px-4 py-4 text-sm text-muted sm:px-5">No one has been invited yet.</li> : null}
        </ul>

        {can.inviteMembers ? (
          <div className="space-y-5 border-t border-line p-4 sm:p-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink">{admin ? "Invite someone" : "Invite someone from your team"}</h3>
              <InviteForm
                action={inviteMember}
                hidden={{ workspace_id: workspace.id }}
                roles={[
                  { value: "approver", label: "Client approver" },
                  { value: "viewer", label: "Client viewer" },
                  ...(admin ? [{ value: "team_member", label: "Agency team member" }] : []),
                ]}
              />
              <p className="hint mt-2">Approvers can approve content and invite their own team. Viewers can follow progress and comment.</p>
            </div>
            {admin && unassigned.length ? (
              <ActionForm action={assignTeamMember} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="workspace_id" value={workspace.id} />
                <div className="flex-1">
                  <label className="label" htmlFor="assign_user">Assign an existing team member</label>
                  <select id="assign_user" name="user_id" className="field">
                    {unassigned.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                    ))}
                  </select>
                </div>
                <SubmitButton variant="secondary" pendingLabel="Assigning…">Assign</SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        ) : null}
      </Card>
      </TabsContent>
      </Tabs>
    </div>
  );
}
