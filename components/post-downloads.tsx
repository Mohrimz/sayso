"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Download, Film, FileText, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, buttonClass } from "@/components/ui";
import { formatBytes } from "@/lib/chat";
import type { MediaDownload } from "@/lib/media";

const noopSubscribe = () => () => {};
/** Phones and tablets: the share sheet can save photos and videos straight to the camera roll. */
const touchShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

function summary(files: MediaDownload[]) {
  const photos = files.filter((f) => f.kind === "image").length;
  const videos = files.filter((f) => f.kind === "video").length;
  const other = files.length - photos - videos;
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  return [part(photos, "photo", "photos"), part(videos, "video", "videos"), part(other, "file", "files")].filter(Boolean).join(" and ");
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "post";
}

/**
 * The finished post's files, for the client and the team to keep: one tap
 * saves them to a phone (share sheet) or downloads them (a ZIP when there are
 * several). Links come from the server and last an hour.
 */
export function PostDownloads({ files, title }: { files: MediaDownload[]; title: string }) {
  const share = useSyncExternalStore(noopSubscribe, touchShare, () => false);
  const [busy, setBusy] = useState(false);
  // Files fetched for the share sheet, kept so a second tap can share straight away.
  const ready = useRef<File[] | null>(null);

  async function fetchAll() {
    return Promise.all(
      files.map(async (f) => {
        const res = await fetch(f.url, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 403 ? "expired" : `HTTP ${res.status}`);
        const blob = await res.blob();
        return new File([blob], f.name, { type: f.mime || blob.type });
      }),
    );
  }

  function failed(error: unknown) {
    toast.error(
      error instanceof Error && error.message === "expired"
        ? "The download links have expired. Refresh the page and try again."
        : "The files couldn't be downloaded. Please try again.",
    );
  }

  async function downloadAll() {
    if (files.length === 1) {
      window.location.href = files[0].url;
      return;
    }
    setBusy(true);
    const toastId = toast.loading(`Preparing ${files.length} files…`);
    try {
      const { downloadZip } = await import("client-zip");
      async function* entries() {
        for (const f of files) {
          const res = await fetch(f.url, { cache: "no-store" });
          if (!res.ok) throw new Error(res.status === 403 ? "expired" : `HTTP ${res.status}`);
          yield { name: f.name, input: res };
        }
      }
      const blob = await downloadZip(entries()).blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeName(title)}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
      toast.success(`Downloaded ${files.length} files.`, { id: toastId });
    } catch (error) {
      toast.dismiss(toastId);
      failed(error);
    } finally {
      setBusy(false);
    }
  }

  async function saveToPhone() {
    setBusy(true);
    try {
      const shared = ready.current ?? (await fetchAll());
      ready.current = shared;
      if (!navigator.canShare?.({ files: shared })) {
        await downloadAll();
        return;
      }
      try {
        await navigator.share({ files: shared, title });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Some browsers only open the share sheet straight after a tap; the files are ready now.
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          toast("Your files are ready. Tap “Save to phone” again.");
          return;
        }
        throw error;
      }
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }

  if (!files.length) return null;
  const label = share ? "Save to phone" : files.length > 1 ? "Download all" : "Download";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{summary(files)}</p>
          <p className="text-xs text-muted">Full quality, as posted</p>
        </div>
        <button type="button" onClick={() => void (share ? saveToPhone() : downloadAll())} disabled={busy} className={buttonClass("primary", "sm")}>
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
          {label}
        </button>
      </div>

      {files.length > 1 || share ? (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {files.map((f) => {
            const Icon = f.kind === "image" ? ImageIcon : f.kind === "video" ? Film : FileText;
            return (
              <li key={f.url}>
                <a href={f.url} download={f.name} className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-sunken" aria-label={`Download ${f.name}`}>
                  <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                  {f.size ? <span className="shrink-0 text-xs text-faint tabular-nums">{formatBytes(f.size)}</span> : null}
                  <Download className="size-4 shrink-0 text-muted" aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
