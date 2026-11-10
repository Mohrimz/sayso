import Link from "next/link";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui";
import { TaskCheck, TaskDelete, TaskStatusSelect } from "@/components/task-controls";
import { ReviewWork, SubmitWork } from "@/components/task-work";
import { formatDate, todayKey } from "@/lib/dates";
import type { Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TaskView = Task & {
  ownerName?: string | null;
  workspaceName?: string;
  workspaceSlug?: string;
  /** The latest review of submitted work, if any. */
  lastReview?: { decision: string | null; note: string | null } | null;
};

/** Who is looking: drives which actions each task offers. */
export type TaskViewer = { id: string; isAgency: boolean; isAdmin: boolean };

/** Which statuses the menu offers for a task, or none when it can't be changed from here. */
function statusOptions(t: TaskView, viewer: TaskViewer): TaskStatus[] {
  if (t.owner_side === "client") return ["todo", "in_progress", "done"];
  // Agency tasks: work in review is handled by Review; team members don't mark done.
  if (t.status === "in_review") return [];
  if (viewer.isAdmin) return ["todo", "in_progress", "done"];
  return t.status === "done" ? [] : ["todo", "in_progress"];
}

export function TaskList({
  tasks,
  tz,
  canEdit,
  canTick,
  viewer,
  showWorkspace = false,
  reviewId,
  empty = "Nothing here.",
}: {
  tasks: TaskView[];
  tz: string;
  canEdit: boolean;
  canTick: (t: TaskView) => boolean;
  viewer: TaskViewer;
  showWorkspace?: boolean;
  /** Opens the review for this task straight away (from a notification link). */
  reviewId?: string;
  empty?: string;
}) {
  if (!tasks.length) return <p className="px-4 py-6 text-center text-sm text-muted sm:px-5">{empty}</p>;
  const today = todayKey(tz);
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => {
        const overdue = t.status !== "done" && t.due_date && t.due_date < today;
        const agencyTask = t.owner_side === "agency";
        const options = canEdit ? statusOptions(t, viewer) : [];
        // Work is submitted by the person the task is assigned to (anyone on the team if nobody is).
        const canSubmit = viewer.isAgency && agencyTask && t.status === "in_progress" && (t.owner_id ? t.owner_id === viewer.id : true);
        const canReview = viewer.isAdmin && agencyTask && t.status === "in_review";
        const waiting = viewer.isAgency && !viewer.isAdmin && agencyTask && t.status === "in_review";
        const changes = viewer.isAgency && t.status === "in_progress" && t.lastReview?.decision === "changes_requested" ? t.lastReview.note : null;
        const tickable = canTick(t) && t.status !== "in_review";
        // Only admins delete tasks.
        const canDelete = canEdit && viewer.isAdmin;
        const hasActions = options.length > 0 || canSubmit || canReview || waiting || canDelete;

        return (
          <li key={t.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <div className="pt-0.5">
              {tickable ? <TaskCheck taskId={t.id} status={t.status} label={t.title} /> : <span className="block size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm text-ink", t.status === "done" && "text-muted line-through")}>{t.title}</p>
              {t.description ? <p className="mt-0.5 text-[13px] text-muted">{t.description}</p> : null}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {showWorkspace && t.workspaceSlug ? (
                  <Link href={`/w/${t.workspaceSlug}/tasks`} className="font-medium text-ink-soft hover:underline">
                    {t.workspaceName}
                  </Link>
                ) : null}
                <span>{t.owner_side === "client" ? `Client${t.ownerName ? `: ${t.ownerName}` : ""}` : (t.ownerName ?? "Agency")}</span>
                {t.due_date ? (
                  <span className={cn(overdue && "font-medium text-danger")}>
                    {overdue ? "Overdue · " : "Due "}
                    {formatDate(t.due_date)}
                  </span>
                ) : null}
                {t.internal ? (
                  <Badge tone="purple">
                    <Lock className="size-3" aria-hidden /> Internal
                  </Badge>
                ) : null}
                {t.status === "in_progress" ? <Badge tone="amber">In progress</Badge> : null}
                {t.status === "in_review" ? (
                  viewer.isAdmin ? (
                    <Badge tone="blue">Submitted</Badge>
                  ) : viewer.isAgency ? (
                    <Badge tone="blue">In review</Badge>
                  ) : (
                    <Badge tone="amber">In progress</Badge>
                  )
                ) : null}
              </div>

              {changes ? (
                <p className="mt-2 rounded-lg bg-orange-50 px-2.5 py-1.5 text-[13px] text-orange-900">
                  <span className="font-medium">Changes requested:</span> {changes}
                </p>
              ) : null}

              {hasActions ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {options.length ? <TaskStatusSelect key={t.status} taskId={t.id} status={t.status} options={options} /> : null}
                  {canSubmit ? <SubmitWork taskId={t.id} workspaceId={t.workspace_id} title={t.title} postId={t.content_item_id} /> : null}
                  {canReview ? <ReviewWork taskId={t.id} title={t.title} defaultOpen={reviewId === t.id} /> : null}
                  {waiting ? <span className="text-xs text-muted">Waiting for review</span> : null}
                  {canDelete ? <TaskDelete taskId={t.id} /> : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
