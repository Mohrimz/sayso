"use client";

import { useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { CheckCircle2, CircleAlert, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/lib/upload";
import { recordUploads, type UploadedFile } from "@/app/actions/library";
import { buttonClass } from "@/components/ui";
import { cleanFolder, formatBytes, MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, SUGGESTED_FOLDERS } from "@/lib/library";
import { cn } from "@/lib/utils";

type Pending = { key: string; file: File; status: "waiting" | "uploading" | "done" | "failed"; error?: string };

/** "Upload files": drop or choose files, pick a folder, and they're added to the Library. */
export function LibraryUploader({ workspaceId, folders, defaultFolder }: { workspaceId: string; folders: string[]; defaultFolder?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Pending[]>([]);
  const [folder, setFolder] = useState(defaultFolder ?? "Product photos");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const options = [...new Set([...folders, ...SUGGESTED_FOLDERS])];

  function add(files: FileList | File[] | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      status: "waiting" as const,
      error: file.size > MAX_FILE_BYTES ? `Bigger than ${formatBytes(MAX_FILE_BYTES)}` : undefined,
    }));
    setItems((current) => [...current, ...next].slice(0, MAX_FILES_PER_UPLOAD));
    if (input.current) input.current.value = "";
  }

  async function upload() {
    const ready = items.filter((i) => i.status !== "done" && !i.error);
    if (!ready.length) return;
    setBusy(true);
    const uploaded: UploadedFile[] = [];
    for (const item of ready) {
      setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "uploading" } : i)));
      const safe = item.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-100) || "file";
      const path = `${workspaceId}/library/${crypto.randomUUID()}/${safe}`;
      const { failed } = await uploadFiles({ scope: "library", workspaceId }, [{ path, file: item.file }]);
      if (failed.size) {
        setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "failed", error: failed.get(path) } : i)));
        continue;
      }
      uploaded.push({ path, name: item.file.name, mime: item.file.type || "application/octet-stream", size: item.file.size });
      setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: "done" } : i)));
    }
    if (uploaded.length) {
      const result = await recordUploads(workspaceId, cleanFolder(folder), uploaded);
      if (result?.ok) {
        toast.success(result.message ?? "Uploaded.");
        if (uploaded.length === ready.length) {
          setOpen(false);
          setItems([]);
        }
      } else {
        toast.error(result?.error ?? "The files uploaded but couldn't be added to the Library.");
      }
    }
    setBusy(false);
  }

  const waiting = items.filter((i) => i.status !== "done" && !i.error).length;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) setItems([]);
      }}
    >
      <Dialog.Trigger className={buttonClass("primary", "md")}>
        <Upload className="size-4" aria-hidden /> Upload files
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" />
        <Dialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-surface shadow-2xl outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-ink">Upload to the Library</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted">Photos, videos, logos or documents, up to {formatBytes(MAX_FILE_BYTES)} each.</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label="Close" disabled={busy}>
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                add(e.dataTransfer.files);
              }}
              disabled={busy}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
                dragging ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent hover:bg-sunken",
              )}
            >
              <Upload className="size-6 text-accent" aria-hidden />
              <span className="text-sm font-medium text-ink">Drop files here, or click to choose</span>
              <span className="text-xs text-muted">Up to {MAX_FILES_PER_UPLOAD} files at a time</span>
            </button>
            <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} onChange={(e) => add(e.target.files)} />

            {items.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {items.map((item) => (
                  <li key={item.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{item.file.name}</span>
                      <span className={cn("block text-xs", item.error ? "text-danger" : "text-muted")}>{item.error ?? formatBytes(item.file.size)}</span>
                    </span>
                    {item.status === "uploading" ? (
                      <Loader2 className="size-4 animate-spin text-accent" aria-label="Uploading" />
                    ) : item.status === "done" ? (
                      <CheckCircle2 className="size-4 text-emerald-600" aria-label="Uploaded" />
                    ) : item.status === "failed" || item.error ? (
                      <CircleAlert className="size-4 text-danger" aria-label="Not uploaded" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setItems((cur) => cur.filter((i) => i.key !== item.key))}
                        className="rounded p-1 text-muted hover:bg-sunken hover:text-ink"
                        aria-label={`Remove ${item.file.name}`}
                        disabled={busy}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            <div>
              <label htmlFor={`${listId}-folder`} className="label">
                Folder
              </label>
              <input
                id={`${listId}-folder`}
                list={listId}
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                maxLength={60}
                className="field"
                placeholder="e.g. Product photos"
                disabled={busy}
              />
              <datalist id={listId}>
                {options.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <p className="hint mt-1">Pick a folder or type a new one.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <Dialog.Close className={buttonClass("secondary", "md")} disabled={busy}>
              Cancel
            </Dialog.Close>
            <button type="button" onClick={upload} disabled={!waiting || busy} className={buttonClass("primary", "md")}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {busy ? "Uploading…" : waiting ? `Upload ${waiting} ${waiting === 1 ? "file" : "files"}` : "Upload"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
