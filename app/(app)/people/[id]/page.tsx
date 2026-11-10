import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, LogIn, Mail, Phone } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avatarUrl } from "@/lib/avatar";
import { formatDate, formatDateTime } from "@/lib/dates";
import { isUuid } from "@/lib/chat";
import { ROLE_LABELS } from "@/lib/permissions";
import { AGENCY_TIME_ZONE, SeenStatus } from "@/components/seen-status";
import { Avatar, Badge, Card, CardHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Profile" };

/**
 * A person's profile, for agency admins: contact details, role, the clients
 * they're part of, and when they were last seen. Linked from the Team page and
 * from each client's People list.
 */
export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const viewer = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [{ data: person }, { data: memberships }, { data: activity }, assigned, approvals] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("workspace_members").select("role, workspaces(id, name, slug, status)").eq("user_id", id),
    supabase.from("user_activity").select("last_seen_at").eq("user_id", id).maybeSingle(),
    supabase.from("content_items").select("id", { count: "exact", head: true }).eq("assignee_id", id),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("approver_id", id),
  ]);
  if (!person) notFound();

  // Sign-in time lives in Supabase Auth, which only the service role can read.
  // Safe here: requireAdmin() above already checked this is an agency admin.
  const { data: auth } = await createAdminClient().auth.admin.getUserById(id);
  const lastSignIn = auth?.user?.last_sign_in_at ?? null;

  const name = person.full_name || person.email.split("@")[0];
  const agency = person.side === "agency";
  const role = agency ? (person.agency_role === "admin" ? "Agency admin" : "Team member") : "Client";
  const clients = (memberships ?? [])
    .map((m) => ({ role: m.role, ws: Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces }))
    .filter((m): m is { role: typeof m.role; ws: NonNullable<typeof m.ws> } => Boolean(m.ws))
    .sort((a, b) => a.ws.name.localeCompare(b.ws.name));
  const back = agency || !clients.length ? { href: "/team", label: "Team" } : { href: `/w/${clients[0].ws.slug}/settings`, label: `${clients[0].ws.name} settings` };

  const details = [
    {
      icon: Mail,
      label: "Email",
      value: (
        <a href={`mailto:${person.email}`} className="text-accent-ink hover:underline">
          {person.email}
        </a>
      ),
    },
    {
      icon: Phone,
      label: "Phone",
      value: person.phone ? (
        <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="text-accent-ink hover:underline">
          {person.phone}
        </a>
      ) : (
        <span className="text-faint">Not added</span>
      ),
    },
    { icon: CalendarDays, label: "Joined", value: formatDate(person.created_at, AGENCY_TIME_ZONE) },
    {
      icon: LogIn,
      label: "Last signed in",
      value: lastSignIn ? formatDateTime(lastSignIn) : <span className="text-faint">Never</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> {back.label}
      </Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={name} src={avatarUrl(person.avatar_path)} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">
              {name} {person.id === viewer.id ? <span className="text-base font-normal text-muted">(you)</span> : null}
            </h1>
            {person.job_title ? <p className="mt-0.5 truncate text-sm text-ink-soft">{person.job_title}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge tone={agency ? "purple" : "blue"}>{role}</Badge>
              <SeenStatus iso={activity?.last_seen_at ?? null} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <dl className="divide-y divide-line">
            {details.map((d) => (
              <div key={d.label} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <d.icon className="size-4 shrink-0 text-muted" aria-hidden />
                <dt className="w-28 shrink-0 text-[13px] text-muted">{d.label}</dt>
                <dd className="min-w-0 flex-1 truncate text-sm text-ink">{d.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader
            title={agency ? "Clients" : "Client workspaces"}
            description={
              agency
                ? person.agency_role === "admin"
                  ? "Admins see every client."
                  : `${(assigned.count ?? 0).toLocaleString()} post${assigned.count === 1 ? "" : "s"} assigned to them.`
                : `${(approvals.count ?? 0).toLocaleString()} approval decision${approvals.count === 1 ? "" : "s"} so far.`
            }
            action={
              agency && person.agency_role !== "admin" ? (
                <Link href="/team" className="text-[13px] font-medium text-accent-ink hover:underline">
                  Change on Team
                </Link>
              ) : null
            }
          />
          {agency && person.agency_role === "admin" ? (
            <p className="px-4 py-4 text-sm text-muted sm:px-5">All clients.</p>
          ) : clients.length ? (
            <ul className="divide-y divide-line">
              {clients.map(({ role: memberRole, ws }) => (
                <li key={ws.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Link href={`/w/${ws.slug}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-accent-ink hover:underline">
                    {ws.name}
                  </Link>
                  {ws.status !== "active" ? <span className="text-xs text-muted capitalize">{ws.status}</span> : null}
                  <Badge tone={memberRole === "team_member" ? "purple" : memberRole === "approver" ? "blue" : "gray"}>{ROLE_LABELS[memberRole]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-muted sm:px-5">{agency ? "Not assigned to any client yet." : "Not part of any client."}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
