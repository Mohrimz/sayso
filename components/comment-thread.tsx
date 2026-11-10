import { CheckCircle2, CircleAlert, Lock } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Badge } from "@/components/ui";
import { addComment, addInternalNote, toggleCommentResolved } from "@/app/actions/content";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type ThreadComment = {
  id: string;
  body: string;
  kind: string;
  resolved: boolean;
  created_at: string;
  version_number: number | null;
  author: { name: string; side: "agency" | "client"; avatar?: string | null } | null;
};

export function CommentThread({
  itemId,
  versionId,
  comments,
  canResolve,
  agencyLabel = "Agency",
}: {
  itemId: string;
  versionId: string | null;
  comments: ThreadComment[];
  canResolve: boolean;
  agencyLabel?: string;
}) {
  return (
    <div>
      {comments.length ? (
        <ol className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className={cn("flex gap-3", c.resolved && "opacity-60")}>
              <Avatar name={c.author?.name ?? "?"} src={c.author?.avatar} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <span className="font-medium text-ink">{c.author?.name ?? "Former user"}</span>
                  {c.author?.side === "agency" ? <span className="text-faint">{agencyLabel}</span> : null}
                  <span className="text-faint">· {timeAgo(c.created_at)}</span>
                  {c.version_number ? <span className="text-faint">· v{c.version_number}</span> : null}
                  {c.kind === "change_request" ? (
                    <Badge tone="orange">
                      <CircleAlert className="size-3" aria-hidden /> Change request
                    </Badge>
                  ) : null}
                  {c.resolved ? <Badge tone="green">Resolved</Badge> : null}
                </div>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{c.body}</p>
                {canResolve ? (
                  <form action={toggleCommentResolved} className="mt-1">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="resolved" value={String(!c.resolved)} />
                    <button type="submit" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                      <CheckCircle2 className="size-3.5" aria-hidden /> {c.resolved ? "Reopen" : "Mark resolved"}
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">No comments yet. Questions and feedback go here.</p>
      )}

      <ActionForm action={addComment} resetOnSuccess showSuccess={false} className="mt-5">
        <input type="hidden" name="item_id" value={itemId} />
        {versionId ? <input type="hidden" name="version_id" value={versionId} /> : null}
        <label className="sr-only" htmlFor={`comment-${itemId}`}>
          Add a comment
        </label>
        <textarea id={`comment-${itemId}`} name="body" rows={3} required className="field" placeholder="Write a comment…" />
        <div className="mt-2 flex justify-end">
          <SubmitButton size="sm" pendingLabel="Posting…">
            Comment
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}

export type NoteEntry = {
  id: string;
  body: string;
  decision: "passed" | "fixes_needed" | null;
  created_at: string;
  version_number: number | null;
  author: string;
};

/** Agency-only notes and internal review decisions. Never shown to clients. */
export function InternalNotes({ itemId, notes }: { itemId: string; notes: NoteEntry[] }) {
  return (
    <div>
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">
        <Lock className="size-3" aria-hidden /> Only the agency team can see this
      </p>
      {notes.length ? (
        <ol className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="flex gap-3">
              <Avatar name={n.author} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-medium text-ink">{n.author}</span>
                  <span className="text-faint">{timeAgo(n.created_at)}</span>
                  {n.version_number ? <span className="text-faint">· v{n.version_number}</span> : null}
                  {n.decision === "passed" ? <Badge tone="green">Passed review</Badge> : null}
                  {n.decision === "fixes_needed" ? <Badge tone="orange">Fixes needed</Badge> : null}
                </div>
                {n.body ? <p className="mt-0.5 text-sm whitespace-pre-line text-ink-soft">{n.body}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">No internal notes.</p>
      )}
      <ActionForm action={addInternalNote} resetOnSuccess showSuccess={false} className="mt-4">
        <input type="hidden" name="item_id" value={itemId} />
        <textarea name="body" rows={2} required className="field" placeholder="Internal note…" aria-label="Internal note" />
        <div className="mt-2 flex justify-end">
          <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
            Add note
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
