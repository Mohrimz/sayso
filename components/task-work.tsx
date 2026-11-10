"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, useSheet } from "@/components/sheet";
import { Button, buttonClass } from "@/components/ui";
import { uploadFiles } from "@/lib/upload";
import { CONTENT_TYPES } from "@/lib/content";
import { formatDate, timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/lib/types";
import {
  createPostForTask,
  getTaskReview,
  listSubmitTargets,
  reviewTaskWork,
  submitTaskWork,
  type SubmitTarget,
  type TaskReview,
} from "@/app/actions/tasks";

const STATUS_LABEL: Record<string, string> = { planned: "Planned", draft: "Draft", internal_review: "Internal review" };

/** The "post" choice that creates a new post for this work. */
const NEW_POST = "__new__";
const TYPE_CHOICES: { id: ContentType; label: string }[] = [
  { id: "feed_post", label: "Post" },
  { id: "carousel", label: "Carousel" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Story" },
];

/** A sensible type for a new post from the task's title ("Carousels" → carousel). */
function guessType(title: string): ContentType {
  const t = title.toLowerCase();
  if (/carous/.test(t)) return "carousel";
  if (/reel|video/.test(t)) return "reel";
  if (/stor/.test(t)) return "story";
  return "feed_post";
}

function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "file";
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "";
  return ext ? `${base}.${ext}` : base;
}

/** "Submit work" on an agency task: pick the post it's for, upload the files, add a note. */
export function SubmitWork({ taskId, workspaceId, title, postId }: { taskId: string; workspaceId: string; title: string; postId: string | null }) {
  return (
    <Sheet title="Submit your work" description={title} triggerLabel="Submit work" triggerVariant="primary">
      <SubmitWorkForm taskId={taskId} workspaceId={workspaceId} postId={postId} taskTitle={title} />
    </Sheet>
  );
}

function SubmitWorkForm({ taskId, workspaceId, postId, taskTitle }: { taskId: string; workspaceId: string; postId: string | null; taskTitle: string }) {
  const sheet = useSheet();
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [targets, setTargets] = useState<SubmitTarget[] | null>(null);
  const [itemId, setItemId] = useState(postId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  // For a new post.
  const [newTitle, setNewTitle] = useState(taskTitle);
  const [newType, setNewType] = useState<ContentType>(guessType(taskTitle));
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listSubmitTargets(taskId).then((list) => {
      if (!live) return;
      setTargets(list);
      // No posts yet: start with a new one.
      setItemId((current) => (list.some((t) => t.id === current) ? current : !list.length ? NEW_POST : list.length === 1 ? list[0].id : ""));
    });
    return () => {
      live = false;
    };
  }, [taskId]);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    // Copy now: the picker is cleared right after, which empties its live FileList.
    const picked = Array.from(list);
    setFiles((current) => [...current, ...picked].slice(0, 20));
  };

  const creating = itemId === NEW_POST;

  async function submit() {
    if (!itemId || !files.length || (creating && !newTitle.trim())) return;
    setBusy(true);
    setError(null);
    try {
      let postId = itemId;
      if (creating) {
        setStatus("Adding the post to the plan…");
        const made = await createPostForTask({ taskId, title: newTitle, type: newType, date: newDate });
        if (!made.ok) throw new Error(made.error);
        // Keep it selected, so a retry uses this post instead of making another.
        setTargets((list) => [...(list ?? []), made.post]);
        setItemId(made.post.id);
        postId = made.post.id;
      }
      const media = [];
      for (const [i, file] of files.entries()) {
        setStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const path = `${workspaceId}/${postId}/${crypto.randomUUID()}/${safeName(file.name)}`;
        const { failed } = await uploadFiles({ scope: "content", itemId: postId }, [{ path, file }]);
        if (failed.size) throw new Error(`${file.name}: ${failed.get(path)}`);
        media.push({ path, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      }
      setStatus("Sending for review…");
      const result = await submitTaskWork({ taskId, itemId: postId, files: media, note });
      if (result?.error) throw new Error(result.error);
      toast.success(result?.message ?? "Sent for review.");
      sheet?.close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  if (targets === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading posts…
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor={`post-${taskId}`}>
          Which post is this for?
        </label>
        <select id={`post-${taskId}`} value={itemId} onChange={(e) => setItemId(e.target.value)} className="field" disabled={busy}>
          <option value="" disabled>
            Choose a post
          </option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} · {CONTENT_TYPES[t.type]?.label ?? t.type}
              {t.plannedAt ? ` · ${formatDate(t.plannedAt)}` : ""} · {STATUS_LABEL[t.status] ?? t.status}
            </option>
          ))}
          <option value={NEW_POST}>New post</option>
        </select>
        {creating ? (
          <div className="mt-3 space-y-3 rounded-xl border border-line bg-sunken/40 p-3">
            <div>
              <label className="label" htmlFor={`new-title-${taskId}`}>
                Post title
              </label>
              <input
                id={`new-title-${taskId}`}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                disabled={busy}
                className="field"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`new-type-${taskId}`}>
                  Type
                </label>
                <select
                  id={`new-type-${taskId}`}
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ContentType)}
                  disabled={busy}
                  className="field"
                >
                  {TYPE_CHOICES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`new-date-${taskId}`}>
                  Goes live (optional)
                </label>
                <input
                  id={`new-date-${taskId}`}
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  disabled={busy}
                  className="field"
                />
              </div>
            </div>
            <p className="text-xs text-muted">It&apos;s added to the monthly plan for Instagram and Facebook.</p>
          </div>
        ) : null}
      </div>

      <div>
        <span className="label">Your files</span>
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-sunken/50 px-4 py-6 text-center transition hover:border-accent hover:bg-accent-soft/40 disabled:opacity-60"
        >
          <UploadCloud className="size-6 text-muted" aria-hidden />
          <span className="text-sm font-medium text-ink">Choose photos, videos or documents</span>
          <span className="text-xs text-muted">Up to 20 files</span>
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length ? (
          <ul className="mt-3 space-y-1.5">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-faint" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
                <span className="shrink-0 text-xs text-faint">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((_, j) => j !== i))}
                  disabled={busy}
                  className="rounded p-1 text-faint hover:bg-sunken hover:text-ink"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor={`note-${taskId}`}>
          Note (optional)
        </label>
        <textarea
          id={`note-${taskId}`}
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          className="field"
          placeholder="Anything the reviewer should know"
        />
      </div>

      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="flex items-center gap-2 text-[13px] text-muted" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {status}
        </p>
      ) : null}

      <Button type="button" variant="primary" size="lg" className="w-full" onClick={submit} disabled={busy || !itemId || !files.length || (creating && !newTitle.trim())}>
        {busy ? "Sending…" : "Send for review"}
      </Button>
    </div>
  );
}

/** "Review" on a task waiting for review: see the work, then mark it done or ask for changes. Admins only. */
export function ReviewWork({ taskId, title, defaultOpen = false }: { taskId: string; title: string; defaultOpen?: boolean }) {
  return (
    <Sheet title="Review work" description={title} triggerLabel="Review" triggerVariant="primary" defaultOpen={defaultOpen}>
      <ReviewPanel taskId={taskId} />
    </Sheet>
  );
}

function ReviewPanel({ taskId }: { taskId: string }) {
  const sheet = useSheet();
  const router = useRouter();
  const [data, setData] = useState<TaskReview | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getTaskReview(taskId).then((review) => {
      if (live) setData(review);
    });
    return () => {
      live = false;
    };
  }, [taskId]);

  async function decide(decision: "approved" | "changes_requested") {
    setBusy(true);
    setError(null);
    const result = await reviewTaskWork({ taskId, decision, note });
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success(result?.message ?? "Saved.");
    sheet?.close();
    router.refresh();
  }

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the work…
      </p>
    );
  }
  if (data === null) return <p className="text-sm text-ink-soft">There&apos;s no submitted work for this task yet.</p>;

  return (
    <div className="space-y-5">
      <div className="text-sm text-ink-soft">
        <p>
          <span className="font-medium text-ink">{data.submittedBy}</span> sent this {timeAgo(data.submittedAt)}
          {data.post ? (
            <>
              {" "}
              for{" "}
              <Link href={data.post.href} className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
                {data.post.title}
              </Link>
            </>
          ) : null}
          .
        </p>
        {data.note ? <p className="mt-2 border-l-2 border-line-strong pl-3 whitespace-pre-wrap text-ink">{data.note}</p> : null}
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {data.files.map((file, i) => (
          <li key={file.path ?? i} className="overflow-hidden rounded-xl border border-line bg-sunken/40">
            {file.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage links, sized by the browser
              <img src={file.src} alt={file.name} className="aspect-square w-full object-cover" />
            ) : file.kind === "video" ? (
              <video src={file.src} controls preload="metadata" className="aspect-square w-full bg-black object-contain" />
            ) : (
              <div className="flex aspect-square items-center justify-center">
                <FileText className="size-8 text-faint" aria-hidden />
              </div>
            )}
            <a href={file.src} target="_blank" rel="noopener noreferrer" className="block truncate px-2.5 py-2 text-xs text-ink-soft hover:text-ink hover:underline">
              {file.name}
            </a>
          </li>
        ))}
      </ul>

      {data.history.length ? (
        <div>
          <p className="text-[13px] font-medium text-ink">Earlier rounds</p>
          <ul className="mt-1.5 space-y-1.5">
            {data.history.map((round, i) => (
              <li key={i} className="text-[13px] text-muted">
                {formatDate(round.submittedAt)}:{" "}
                {round.decision === "changes_requested"
                  ? `changes requested${round.reviewer ? ` by ${round.reviewer}` : ""}${round.reviewNote ? `: “${round.reviewNote}”` : ""}`
                  : round.decision === "approved"
                    ? "approved"
                    : "not reviewed"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {asking ? (
        <div>
          <label className="label" htmlFor={`changes-${taskId}`}>
            What needs to change?
          </label>
          <textarea
            id={`changes-${taskId}`}
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            className="field"
            autoFocus
          />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {asking ? (
          <>
            <Button type="button" variant="primary" className="flex-1" onClick={() => decide("changes_requested")} disabled={busy || !note.trim()}>
              {busy ? "Sending…" : "Send the changes"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAsking(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="primary" className="flex-1" onClick={() => decide("approved")} disabled={busy}>
              {busy ? "Saving…" : "Mark done"}
            </Button>
            <button type="button" onClick={() => setAsking(true)} disabled={busy} className={cn(buttonClass("secondary"), "flex-1")}>
              Request changes
            </button>
          </>
        )}
      </div>
      {!asking ? (
        <p className="text-xs text-muted">Mark done adds these files to the post as its next version.</p>
      ) : null}
    </div>
  );
}
