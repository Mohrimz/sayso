"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import { Check, CheckSquare, Download, FileText, Loader2, Play, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { assetDownloadUrl, deleteAsset, updateAsset } from "@/app/actions/library";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { buttonClass } from "@/components/ui";
import { extensionOf, formatBytes, type AssetKind } from "@/lib/library";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/app/actions/types";

export type AssetView = {
  id: string;
  name: string;
  folder: string;
  kind: AssetKind;
  size: number;
  url: string;
  note: string | null;
  uploadedBy: string;
  added: string;
  canEdit: boolean;
};

/**
 * The Library grid. Click a file to see it large and download it; agency admins
 * can also rename, move or delete it. Everyone can download everything shown,
 * or select files and download just those.
 */
export function AssetGrid({ items, folders, zipName }: { items: AssetView[]; folders: string[]; zipName: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const open = items.find((i) => i.id === openId) ?? null;
  const chosen = items.filter((i) => picked.has(i.id));

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function download(files: AssetView[]) {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      const done = await downloadFiles(files, zipName);
      if (done) {
        setSelecting(false);
        setPicked(new Set());
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {selecting ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium text-ink tabular-nums">{chosen.length} selected</span>
            <button type="button" onClick={() => setPicked(new Set(items.map((i) => i.id)))} className="font-medium text-accent-ink hover:underline">
              Select all {items.length}
            </button>
            {chosen.length ? (
              <button type="button" onClick={() => setPicked(new Set())} className="text-muted hover:text-ink hover:underline">
                Clear
              </button>
            ) : null}
          </div>
        ) : (
          <button type="button" onClick={() => setSelecting(true)} className={buttonClass("secondary", "sm")}>
            <CheckSquare className="size-3.5" aria-hidden /> Select
          </button>
        )}
        <div className="flex items-center gap-2">
          {selecting ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelecting(false);
                  setPicked(new Set());
                }}
                className={buttonClass("ghost", "sm")}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" onClick={() => void download(chosen)} disabled={!chosen.length || busy} className={buttonClass("primary", "sm")}>
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
                Download {chosen.length ? chosen.length : ""}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void download(items)} disabled={busy} className={buttonClass("secondary", "sm")}>
              {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
              Download all {items.length}
            </button>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const on = picked.has(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => (selecting ? toggle(item.id) : setOpenId(item.id))}
                aria-pressed={selecting ? on : undefined}
                aria-label={selecting ? `${on ? "Deselect" : "Select"} ${item.name}` : undefined}
                className={cn(
                  "group relative block w-full overflow-hidden rounded-xl border bg-surface text-left transition hover:shadow-sm focus-visible:border-accent focus-visible:outline-none",
                  on ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-strong",
                )}
              >
                <Thumb item={item} />
                {selecting ? (
                  <span
                    className={cn(
                      "absolute top-2 left-2 flex size-6 items-center justify-center rounded-full border-2 shadow-sm transition",
                      on ? "border-accent bg-accent text-white" : "border-white bg-black/30 text-transparent",
                    )}
                    aria-hidden
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                ) : null}
                <span className="block px-3 py-2.5">
                  <span className="block truncate text-[13px] font-medium text-ink">{item.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {item.folder} · {formatBytes(item.size)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open ? <AssetDialog key={open.id} item={open} folders={folders} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

type SaveFilePicker = (options: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
  createWritable: () => Promise<WritableStream>;
}>;

/**
 * Downloads files: one file as itself, several as a ZIP (folders kept) built in
 * the browser from the files' own links. Very large ZIPs are written straight
 * to disk where the browser allows it. Returns false when cancelled or failed.
 */
async function downloadFiles(files: AssetView[], zipName: string): Promise<boolean> {
  if (files.length === 1) {
    const result = await assetDownloadUrl(files[0].id);
    if ("url" in result) {
      window.location.href = result.url;
      return true;
    }
    toast.error(result.error);
    return false;
  }

  const toastId = toast.loading(`Preparing ${files.length} files…`);
  try {
    const { downloadZip } = await import("client-zip");
    const used = new Set<string>();
    const zipPath = (f: AssetView) => {
      const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "file";
      const base = `${safe(f.folder)}/${safe(f.name)}`;
      let candidate = base;
      for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = base.replace(/(\.[^./]+)?$/, ` (${n})$1`);
      used.add(candidate.toLowerCase());
      return candidate;
    };
    let count = 0;
    async function* entries() {
      for (const file of files) {
        // Fresh copy: the thumbnail may already be cached from an <img> load, which lacks the CORS headers fetch needs.
        const res = await fetch(file.url, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 403 ? "expired" : `HTTP ${res.status}`);
        count++;
        toast.loading(`Preparing ${count} of ${files.length} files…`, { id: toastId });
        yield { name: zipPath(file), input: res };
      }
    }
    const zip = downloadZip(entries());
    const total = files.reduce((sum, f) => sum + f.size, 0);
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    if (picker && total > 300 * 1024 * 1024 && zip.body) {
      const handle = await picker({ suggestedName: zipName, types: [{ description: "ZIP file", accept: { "application/zip": [".zip"] } }] });
      await zip.body.pipeTo(await handle.createWritable());
    } else {
      const blob = await zip.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = zipName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
    }
    toast.success(`Downloaded ${files.length} files.`, { id: toastId });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      toast.dismiss(toastId);
      return false;
    }
    toast.error(
      error instanceof Error && error.message === "expired"
        ? "The download links have expired. Refresh the page and try again."
        : "The files couldn't be downloaded. Please try again.",
      { id: toastId },
    );
    return false;
  }
}

function Thumb({ item }: { item: AssetView }) {
  if (item.kind === "photo") {
    return (
      <span className="block aspect-square overflow-hidden bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs */}
        <img src={item.url} alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      </span>
    );
  }
  if (item.kind === "video") {
    return (
      <span className="relative block aspect-square overflow-hidden bg-ink">
        <video src={`${item.url}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="ml-0.5 size-4 fill-current" aria-hidden />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex aspect-square flex-col items-center justify-center gap-2 bg-sunken text-muted">
      <FileText className="size-9" aria-hidden />
      <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-soft">{extensionOf(item.name)}</span>
    </span>
  );
}

function AssetDialog({ item, folders, onClose }: { item: AssetView; folders: string[]; onClose: () => void }) {
  const listId = useId();
  const [downloading, startDownload] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveState, save] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await updateAsset(prev, fd);
    if (result?.ok) toast.success(result.message ?? "Saved.");
    return result;
  }, null);
  const [deleteState, remove, deleting] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await deleteAsset(prev, fd);
    if (result?.ok) {
      toast.success(result.message ?? "Deleted.");
      onClose();
    }
    return result;
  }, null);

  function download() {
    startDownload(async () => {
      const result = await assetDownloadUrl(item.id);
      if ("url" in result) window.location.href = result.url;
      else toast.error(result.error);
    });
  }

  return (
    <Dialog.Root open onOpenChange={(next) => (next || deleting ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-[2px]" />
        <Dialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[min(880px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl outline-none md:flex-row">
          <div className="flex min-h-[220px] items-center justify-center bg-ink md:w-[58%]">
            {item.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img src={item.url} alt={item.name} className="max-h-[50dvh] w-full object-contain md:max-h-[86dvh]" />
            ) : item.kind === "video" ? (
              <video src={item.url} controls playsInline className="max-h-[50dvh] w-full md:max-h-[86dvh]" />
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-white/80">
                <FileText className="size-14" aria-hidden />
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold tracking-wide">{extensionOf(item.name)}</span>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-base font-semibold text-ink">{item.name}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[13px] text-muted">
                  {item.folder} · {formatBytes(item.size)}
                </Dialog.Description>
              </div>
              <Dialog.Close className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
                <X className="size-4" aria-hidden />
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <button type="button" onClick={download} disabled={downloading} className={buttonClass("primary", "md", "w-full")}>
                {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} Download
              </button>

              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Added by</dt>
                  <dd className="truncate text-ink">{item.uploadedBy}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Added</dt>
                  <dd className="text-ink">{item.added}</dd>
                </div>
              </dl>
              {item.note && !item.canEdit ? <p className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-ink-soft">{item.note}</p> : null}

              {item.canEdit ? (
                <form action={save} className="space-y-3 border-t border-line pt-4">
                  <input type="hidden" name="id" value={item.id} />
                  <div>
                    <label className="label" htmlFor={`${listId}-name`}>
                      Name
                    </label>
                    <input id={`${listId}-name`} name="name" defaultValue={item.name} maxLength={200} required className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`${listId}-folder`}>
                      Folder
                    </label>
                    <input id={`${listId}-folder`} name="folder" list={listId} defaultValue={item.folder} maxLength={60} className="field" />
                    <datalist id={listId}>
                      {folders.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="label" htmlFor={`${listId}-note`}>
                      Note <span className="font-normal text-muted">(optional)</span>
                    </label>
                    <textarea id={`${listId}-note`} name="note" defaultValue={item.note ?? ""} maxLength={500} rows={2} className="field" placeholder="e.g. Use for the launch reel" />
                  </div>
                  <FormMessage state={saveState} />
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Save changes
                  </SubmitButton>
                </form>
              ) : null}

              {item.canEdit ? (
                <form action={remove} className="border-t border-line pt-4">
                  <input type="hidden" name="id" value={item.id} />
                  <FormMessage state={deleteState} />
                  {confirmDelete ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-ink-soft">Delete this file for everyone?</span>
                      <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
                        Delete
                      </SubmitButton>
                      <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass("ghost", "sm")}>
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-danger hover:underline">
                      <Trash2 className="size-3.5" aria-hidden /> Delete file
                    </button>
                  )}
                </form>
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
