"use client";

import { Download, FileText, Film } from "lucide-react";
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

/** Images and videos as previews, everything else as a download row. */
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
  if (!files.length) return null;
  const media = files.filter((f) => attachmentKind(f.mime) !== "file");
  const docs = files.filter((f) => attachmentKind(f.mime) === "file");

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
              <video
                key={f.path}
                src={src}
                controls
                preload="metadata"
                onLoadedMetadata={onMediaLoad}
                className="max-h-72 w-full rounded-xl border border-line bg-ink object-contain"
              />
            ) : (
              <a key={f.path} href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, sized by the browser */}
                <img
                  src={src}
                  alt={f.name}
                  onLoad={onMediaLoad}
                  className={cn("w-full object-cover transition hover:opacity-90", media.length > 1 ? "aspect-square" : "max-h-80")}
                />
              </a>
            );
          })}
        </div>
      ) : null}
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

/** Three bouncing dots for "is typing". */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 120}ms`, animationDuration: "900ms" }} />
      ))}
    </span>
  );
}
