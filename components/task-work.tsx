"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Film, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, useSheet } from "@/components/sheet";
import { DownloadButton, Lightbox } from "@/components/chat/message-parts";
import { Button, buttonClass } from "@/components/ui";
import { uploadFiles } from "@/lib/upload";
import { CONTENT_TYPES } from "@/lib/content";
import { formatDate, timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/lib/types";
import type { SignedMedia } from "@/lib/media";
import {
  createPostForTask,
  getTaskReview,
  listSubmitTargets,
  reviewTaskWork,
  startOwnWork,
  submitTaskWork,
  type SubmitTarget,
  type TaskReview,
} from "@/app/actions/tasks";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  draft: "Draft",
  internal_review: "Internal review",
};

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
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 8)
      : "";
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

/**
 * "Send work" without a task on the board: the team member says what it is,
 * picks the client and post, and uploads it. It's reviewed like task work.
 */
export function SendWork({ clients }: { clients: { id: string; name: string }[] }) {
  if (!clients.length) return null;
  return (
    <Sheet
      title="Send work for review"
      description="Your work goes to an admin to check, like a task."
      triggerLabel="Send work"
      icon="plus"
      triggerVariant="primary"
    >
      <SubmitWorkForm taskId={null} workspaceId={clients[0].id} postId={null} taskTitle="" clients={clients} />
    </Sheet>
  );
}

function SubmitWorkForm({
  taskId: givenTaskId,
  workspaceId,
  postId,
  taskTitle,
  clients = [],
}: {
  /** The task this work is for, or null for work sent without one (it gets its own task). */
  taskId: string | null;
  workspaceId: string;
  postId: string | null;
  taskTitle: string;
  /** Work sent without a task, from the team board: the clients to choose from. */
  clients?: { id: string; name: string }[];
}) {
  const ownWork = !givenTaskId;
  const formId = givenTaskId ?? "new";
  // For work sent without a task, the task made for it on the first try (a retry reuses it).
  const [taskId, setTaskId] = useState<string | null>(givenTaskId);
  const [wsId, setWsId] = useState(workspaceId);
  const [workTitle, setWorkTitle] = useState("");
  const sheet = useSheet();
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [targets, setTargets] = useState<SubmitTarget[] | null>(null);
  const [itemId, setItemId] = useState(postId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Map<File, string>>(new Map());
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
    if (!givenTaskId && !wsId) return;
    void listSubmitTargets(givenTaskId ? { taskId: givenTaskId } : { workspaceId: wsId }).then((list) => {
      if (!live) return;
      setTargets(list);
      // No posts yet: start with a new one.
      setItemId((current) => (list.some((t) => t.id === current) ? current : !list.length ? NEW_POST : list.length === 1 ? list[0].id : ""));
    });
    return () => {
      live = false;
    };
  }, [givenTaskId, wsId]);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    // Copy now: the picker is cleared right after, which empties its live FileList.
    const picked = Array.from(list);
    const urls = picked.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/")).map((f) => [f, URL.createObjectURL(f)] as const);
    made.current.push(...urls.map(([, url]) => url));
    setPreviews((current) => new Map([...current, ...urls]));
    setFiles((current) => [...current, ...picked].slice(0, 20));
  };

  const creating = itemId === NEW_POST;

  // Thumbnails for the picked photos and videos, so they can be checked before sending.
  const [viewing, setViewing] = useState<number | null>(null);
  const made = useRef<string[]>([]);
  useEffect(() => () => made.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const pickedImages = files
    .filter((f) => f.type.startsWith("image/") && previews.has(f))
    .map((f) => ({ file: f, src: previews.get(f)!, name: f.name }));

  const postTitle = newTitle.trim() || workTitle.trim();
  const ready = Boolean(itemId && files.length && (!creating || postTitle) && (!ownWork || (wsId && workTitle.trim())));

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      let task = taskId;
      if (!task) {
        setStatus("Starting…");
        const started = await startOwnWork({
          workspaceId: wsId,
          title: workTitle,
        });
        if (!started.ok) throw new Error(started.error);
        setTaskId(started.taskId);
        task = started.taskId;
      }
      let postId = itemId;
      if (creating) {
        setStatus("Adding the post to the plan…");
        const made = await createPostForTask({
          taskId: task,
          title: postTitle,
          type: newType,
          date: newDate,
        });
        if (!made.ok) throw new Error(made.error);
        // Keep it selected, so a retry uses this post instead of making another.
        setTargets((list) => [...(list ?? []), made.post]);
        setItemId(made.post.id);
        postId = made.post.id;
      }
      const media = [];
      for (const [i, file] of files.entries()) {
        setStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const path = `${wsId}/${postId}/${crypto.randomUUID()}/${safeName(file.name)}`;
        const { failed } = await uploadFiles({ scope: "content", itemId: postId }, [{ path, file }]);
        if (failed.size) throw new Error(`${file.name}: ${failed.get(path)}`);
        media.push({
          path,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
        });
      }
      setStatus("Sending for review…");
      const result = await submitTaskWork({
        taskId: task,
        itemId: postId,
        files: media,
        note,
      });
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

  // Once the work's task exists (after a first try), its client and title stay as they are.
  const locked = busy || Boolean(ownWork && taskId);
  return (
    <div className="space-y-5">
      {ownWork ? (
        <>
          {clients.length > 1 ? (
            <div>
              <label className="label" htmlFor="work-client">
                Which client is it for?
              </label>
              <select
                id="work-client"
                value={wsId}
                onChange={(e) => {
                  setWsId(e.target.value);
                  setTargets(null);
                  setItemId("");
                }}
                disabled={locked}
                className="field"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="work-title">
              What&apos;s the work?
            </label>
            <input
              id="work-title"
              value={workTitle}
              onChange={(e) => setWorkTitle(e.target.value)}
              maxLength={200}
              disabled={locked}
              className="field"
              placeholder="e.g. Black Friday carousel"
            />
          </div>
        </>
      ) : null}
      {targets === null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading posts…
        </p>
      ) : (
        <>
          <div>
            <label className="label" htmlFor={`post-${formId}`}>
              Which post is this for?
            </label>
            <select id={`post-${formId}`} value={itemId} onChange={(e) => setItemId(e.target.value)} className="field" disabled={busy}>
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
                  <label className="label" htmlFor={`new-title-${formId}`}>
                    Post title
                  </label>
                  <input
                    id={`new-title-${formId}`}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={workTitle}
                    maxLength={200}
                    disabled={busy}
                    className="field"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`new-type-${formId}`}>
                      Type
                    </label>
                    <select
                      id={`new-type-${formId}`}
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
                    <label className="label" htmlFor={`new-date-${formId}`}>
                      Goes live (optional)
                    </label>
                    <input
                      id={`new-date-${formId}`}
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
                    {file.type.startsWith("image/") && previews.get(file) ? (
                      <button
                        type="button"
                        onClick={() => setViewing(pickedImages.findIndex((img) => img.file === file))}
                        className="size-12 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-sunken"
                        aria-label={`Preview ${file.name}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file */}
                        <img src={previews.get(file)} alt="" className="size-full object-cover" />
                      </button>
                    ) : file.type.startsWith("video/") && previews.get(file) ? (
                      <a
                        href={previews.get(file)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex size-12 shrink-0 items-center justify-center rounded-md bg-ink text-white"
                        aria-label={`Play ${file.name}`}
                      >
                        <Film className="size-5" aria-hidden />
                      </a>
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-sunken">
                        <FileText className="size-4 text-faint" aria-hidden />
                      </span>
                    )}
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
            {viewing !== null && pickedImages[viewing] ? <Lightbox images={pickedImages} start={viewing} onClose={() => setViewing(null)} /> : null}
          </div>

          <div>
            <label className="label" htmlFor={`note-${formId}`}>
              Note (optional)
            </label>
            <textarea
              id={`note-${formId}`}
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

          <Button type="button" variant="primary" size="lg" className="w-full" onClick={submit} disabled={busy || !ready}>
            {busy ? "Sending…" : "Send for review"}
          </Button>
        </>
      )}
    </div>
  );
}

/** Submitted files: photos open full size on a click, each file can be downloaded. */
function WorkFiles({ files }: { files: SignedMedia[] }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const images = files.filter((f) => f.kind === "image").map((f) => ({ src: f.src, name: f.name }));
  return (
    <>
      <ul className="grid grid-cols-2 gap-3">
        {files.map((file, i) => (
          <li key={file.path ?? i} className="overflow-hidden rounded-xl border border-line bg-sunken/40">
            <div className="relative">
              {file.kind === "image" ? (
                <button
                  type="button"
                  onClick={() => setViewing(images.findIndex((img) => img.src === file.src))}
                  className="block w-full cursor-zoom-in"
                  aria-label={`Open ${file.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage links, sized by the browser */}
                  <img src={file.src} alt={file.name} className="aspect-square w-full bg-sunken object-contain" />
                </button>
              ) : file.kind === "video" ? (
                <video src={file.src} controls preload="metadata" className="aspect-square w-full bg-black object-contain" />
              ) : (
                <a
                  href={file.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex aspect-square items-center justify-center"
                  aria-label={`Open ${file.name}`}
                >
                  <FileText className="size-8 text-faint" aria-hidden />
                </a>
              )}
              <DownloadButton src={file.src} name={file.name} className="absolute top-1.5 right-1.5" />
            </div>
            <p className="truncate px-2.5 py-2 text-xs text-ink-soft">{file.name}</p>
          </li>
        ))}
      </ul>
      {viewing !== null && images[viewing] ? <Lightbox images={images} start={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

/** "View work" on a task: the files and note that were sent, without the review buttons. For the team. */
export function ViewWork({ taskId, title }: { taskId: string; title: string }) {
  return (
    <Sheet title="Submitted work" description={title} triggerLabel="View work">
      <ReviewPanel taskId={taskId} readOnly />
    </Sheet>
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

function ReviewPanel({ taskId, readOnly = false }: { taskId: string; readOnly?: boolean }) {
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
              <Link
                href={data.post.href}
                className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
              >
                {data.post.title}
              </Link>
            </>
          ) : null}
          .
        </p>
        {data.note ? <p className="mt-2 border-l-2 border-line-strong pl-3 whitespace-pre-wrap text-ink">{data.note}</p> : null}
      </div>

      <WorkFiles files={data.files} />

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

      {readOnly ? null : asking ? (
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

      {readOnly ? null : (
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
      )}
      {!asking && !readOnly ? (
        <p className="text-xs text-muted">Mark done adds these files to the post and sends it back to {data.submittedBy} to send to the client.</p>
      ) : null}
    </div>
  );
}
