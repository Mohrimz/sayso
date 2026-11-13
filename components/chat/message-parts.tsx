"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { ChevronLeft, ChevronRight, Download, FileText, Film, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { attachmentKind, formatBytes, type ChatAttachment } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { MentionChip, type MentionedPerson } from "./mention-profile";

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Plain text with "@Name" for each mentioned person shown as a chip that opens their profile card. */
function withMentions(text: string, mentions: MentionedPerson[], mine: boolean, key: string) {
  if (!mentions.length || !text.includes("@")) return text;
  const byName = new Map(mentions.map((m) => [m.name.toLowerCase(), m]));
  const names = [...byName.values()].map((m) => m.name).sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${names.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const person = byName.get(match[1].toLowerCase());
    out.push(
      person ? (
        <MentionChip key={`${key}-${at}`} person={person} label={match[0]} mine={mine} />
      ) : (
        <span key={`${key}-${at}`} className={cn("rounded px-0.5 font-semibold", mine ? "text-white" : "text-accent-ink")}>
          {match[0]}
        </span>
      ),
    );
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Message text with line breaks kept, web links made clickable and @mentions opening the person's profile card. */
export function MessageText({ text, mine, mentions = [] }: { text: string; mine: boolean; mentions?: MentionedPerson[] }) {
  const parts = text.split(URL_RE);
  return (
    <p className="text-[15px] leading-snug break-words whitespace-pre-wrap sm:text-sm">
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{withMentions(part, mentions, mine, String(i))}</span>;
        // Leave sentence punctuation after a link outside it.
        const trail = /[.,!?;:)\]]+$/.exec(part)?.[0] ?? "";
        const href = trail ? part.slice(0, -trail.length) : part;
        return (
          <span key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("break-all underline underline-offset-2", mine ? "text-white decoration-white/60" : "text-accent-ink decoration-accent/40")}
            >
              {href}
            </a>
            {trail}
          </span>
        );
      })}
    </p>
  );
}

/**
 * Saves a chat file to the person's device. Files live on another address, so
 * a plain download link would just open them; fetching a fresh copy first
 * (the cached thumbnail lacks the headers fetch needs) lets the browser save it.
 */
async function saveFile(src: string, name: string) {
  try {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    // Couldn't fetch it (e.g. the link expired): open it so it can still be saved by hand.
    window.open(src, "_blank", "noopener");
    toast.message("Opened in a new tab. Save it from there.");
  }
}

export function DownloadButton({ src, name, className }: { src: string; name: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        await saveFile(src, name);
        setBusy(false);
      }}
      className={cn("inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80", className)}
      aria-label={`Download ${name}`}
      title="Download"
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
    </button>
  );
}

/** Full-size view of a message's photos, with download, and arrows when there are several. */
export function Lightbox({ images, start, onClose }: { images: { src: string; name: string }[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const current = images[Math.min(index, images.length - 1)];
  const go = (to: number) => setIndex(Math.min(images.length - 1, Math.max(0, to)));
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/85" />
        <Dialog.Content
          className="fixed inset-0 z-[60] flex flex-col outline-none"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(index + 1);
            if (e.key === "ArrowLeft") go(index - 1);
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3 text-white">
            <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-medium">
              {current.name}
              {images.length > 1 ? <span className="ml-2 text-white/60 tabular-nums">{index + 1} / {images.length}</span> : null}
            </Dialog.Title>
            <DownloadButton src={current.src} name={current.name} className="size-9 bg-white/15 hover:bg-white/25" />
            <Dialog.Close className="inline-flex size-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Close preview">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, shown at its own size */}
            <img key={current.src} src={current.src} alt={current.name} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
            {index > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index - 1);
                }}
                className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
            ) : null}
            {index < images.length - 1 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index + 1);
                }}
                className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                aria-label="Next photo"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Images and videos as previews (click a photo to see it full size), everything else as a download row. Each has a download button. */
export function Attachments({
  files,
  signed,
  mine,
  onMediaLoad,
}: {
  files: ChatAttachment[];
  signed: Record<string, string>;
  mine: boolean;
  onMediaLoad?: () => void;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  if (!files.length) return null;
  const media = files.filter((f) => attachmentKind(f.mime) !== "file");
  const docs = files.filter((f) => attachmentKind(f.mime) === "file");
  const images = media.filter((f) => attachmentKind(f.mime) === "image" && signed[f.path]).map((f) => ({ path: f.path, src: signed[f.path], name: f.name }));
  const overlay = "absolute top-1.5 right-1.5";

  return (
    <div className={cn("flex max-w-full flex-col gap-1.5", mine ? "items-end" : "items-start")}>
      {media.length ? (
        <div className={cn("grid max-w-[min(100%,320px)] gap-1.5", media.length > 1 && "grid-cols-2")}>
          {media.map((f) => {
            const src = signed[f.path];
            const kind = attachmentKind(f.mime);
            if (!src) {
              return (
                <div key={f.path} className="flex aspect-square w-40 animate-pulse items-center justify-center rounded-xl bg-sunken text-faint">
                  {kind === "video" ? <Film className="size-5" aria-hidden /> : null}
                </div>
              );
            }
            return kind === "video" ? (
              <div key={f.path} className="group/media relative">
                <video src={src} controls preload="metadata" onLoadedMetadata={onMediaLoad} className="max-h-72 w-full rounded-xl border border-line bg-ink object-contain" />
                <DownloadButton src={src} name={f.name} className={overlay} />
              </div>
            ) : (
              <div key={f.path} className="group/media relative overflow-hidden rounded-xl border border-line bg-sunken">
                <button type="button" onClick={() => setViewing(images.findIndex((i) => i.path === f.path))} className="block w-full cursor-zoom-in" aria-label={`Open ${f.name}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, sized by the browser */}
                  <img
                    src={src}
                    alt={f.name}
                    onLoad={onMediaLoad}
                    className={cn("w-full object-cover transition group-hover/media:opacity-90", media.length > 1 ? "aspect-square" : "max-h-80")}
                  />
                </button>
                <DownloadButton src={src} name={f.name} className={overlay} />
              </div>
            );
          })}
        </div>
      ) : null}
      {viewing !== null && images[viewing] ? <Lightbox images={images} start={viewing} onClose={() => setViewing(null)} /> : null}
      {docs.map((f) => {
        const src = signed[f.path];
        return (
          <a
            key={f.path}
            href={src || undefined}
            download={f.name}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!src}
            className="flex w-[min(100%,280px)] items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <FileText className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{f.name}</span>
              <span className="block text-xs text-muted">{formatBytes(f.size) || "File"}</span>
            </span>
            <Download className="size-4 shrink-0 text-muted" aria-hidden />
          </a>
        );
      })}
    </div>
  );
}

/** Three bouncing dots for "is typing". `large` is the size used inside a chat bubble. */
export function TypingDots({ large = false }: { large?: boolean }) {
  return (
    <span className={cn("inline-flex items-center", large ? "gap-1" : "gap-0.5")} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("animate-bounce rounded-full bg-current motion-reduce:animate-pulse", large ? "size-2" : "size-1")}
          style={{ animationDelay: `${i * 140}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}
