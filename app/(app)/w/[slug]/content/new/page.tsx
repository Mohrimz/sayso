import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAgencyAssignees } from "@/lib/queries";
import { currentMonth, isMonthParam, monthLabel } from "@/lib/dates";
import { asArray, type ApprovalRuleEntry } from "@/lib/types";
import { Card, EmptyState, ButtonLink } from "@/components/ui";
import { ContentForm } from "@/components/content-form";
import { createContentItem } from "@/app/actions/content";

export default async function NewContentPage({ params, searchParams }: PageProps<"/w/[slug]/content/new">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { workspace, viewer, can } = await getWorkspaceAccess(slug);
  if (!can.editContent) redirect(`/w/${workspace.slug}`);
  const supabase = await createClient();

  const month = typeof sp.month === "string" && isMonthParam(sp.month) ? sp.month : currentMonth(workspace.time_zone);
  const [{ data: plans }, people] = await Promise.all([
    supabase.from("monthly_plans").select("id, month").eq("workspace_id", workspace.id).neq("status", "closed").order("month"),
    getAgencyAssignees(workspace.id),
  ]);
  const options = (plans ?? []).map((p) => ({ id: p.id, month: p.month.slice(0, 7), label: monthLabel(p.month.slice(0, 7)) }));
  const selected = options.find((p) => p.month === month) ?? options[0];
  const ordered = selected ? [selected, ...options.filter((p) => p.id !== selected.id)] : options;
  const ruleTags = asArray<ApprovalRuleEntry>(workspace.rules).map((r) => r.tag);
  const day = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/w/${workspace.slug}/plan/${month}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> {monthLabel(month)} plan
      </Link>
      <h1 className="mb-5 text-xl font-semibold tracking-tight sm:text-2xl">New content</h1>
      {ordered.length ? (
        <Card className="p-4 sm:p-6">
          <ContentForm
            action={createContentItem}
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            timeZone={workspace.time_zone}
            plans={ordered}
            people={people}
            suggestedTags={[...new Set([...ruleTags, "AI-generated", "uses customer review", "promo"])]}
            defaults={{ assignee_id: viewer.id, planned_at_local: day ? `${day}T09:00` : undefined }}
            submitLabel="Create content item"
          />
        </Card>
      ) : (
        <Card>
          <EmptyState title="Create a monthly plan first">
            <ButtonLink href={`/w/${workspace.slug}/plan/${month}`} size="sm" variant="primary" className="mt-2">
              Go to the plan
            </ButtonLink>
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
