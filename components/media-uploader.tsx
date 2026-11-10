"use client";

import { useRef, useState } from "react";
import { uploadFiles } from "@/lib/upload";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { addContentVersion } from "@/app/actions/content";
import { buttonClass } from "@/components/ui";
import { useSheet } from "@/components/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "file";
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "";
  return ext ? `${base}.${ext}` : base;
}

/**
 * Uploads images or video straight to storage from the browser, then records
 * them as a new version. Earlier versions are kept.
 */
export function MediaUploader({
  workspaceId,
  itemId,
  hasVersions,
}: {
  workspaceId: string;
  itemId: string;
  hasVersions: boolean;
}) {
  const router = useRouter();
  const sheet = useSheet();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const media = [];
    try {
      for (const [i, file] of files.entries()) {
        setStatus(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const path = `${workspaceId}/${itemId}/${crypto.randomUUID()}/${safeName(file.name)}`;
        const { failed } = await uploadFiles({ scope: "content", itemId }, [{ path, file }]);
        if (failed.size) throw new Error(`${file.name}: ${failed.get(path)}`);
        media.push({ path, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      }
      setStatus("Saving version…");
      const result = await addContentVersion(itemId, media, note);
      if (result?.error) throw new Error(result.error);
      setFiles([]);
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      setStatus(null);
      toast.success(result?.message ?? "Uploaded");
      sheet?.close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-sunken/50 px-4 py-6 text-center transition hover:border-accent hover:bg-accent-soft/40",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="size-6 text-muted" aria-hidden />
        <span className="text-sm font-medium text-ink">
          {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} selected` : hasVersions ? "Upload a new version" : "Upload images or video"}
        </span>
        <span className="text-xs text-muted">Select several images for a carousel, in slide order.</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>

      {files.length ? (
        <>
          <ul className="space-y-1 text-[13px] text-ink-soft">
            {files.map((f) => (
              <li key={f.name + f.size} className="flex justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 tabular-nums text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
          <input
            className="field"
            placeholder={hasVersions ? "What changed? (optional)" : "Note (optional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" onClick={upload} disabled={busy} className={buttonClass("primary", "md", "w-full")}>
            {busy ? "Uploading…" : hasVersions ? "Save as new version" : "Upload"}
          </button>
        </>
      ) : null}

      {status ? <p className="text-[13px] text-muted">{status}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
