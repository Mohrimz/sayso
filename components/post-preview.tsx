"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type TouchEvent } from "react";
import { animate, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Film, ImageOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reorderMedia, saveCaption } from "@/app/actions/content";
import { buttonClass } from "@/components/ui";
import type { SignedMedia } from "@/lib/media";
import { cn } from "@/lib/utils";

type Size = { w: number; h: number };
const keyOf = (m: SignedMedia) => m.path ?? m.url ?? m.src;

/** "4:5", "1:1", "9:16"… for the common shapes, otherwise "1.33:1". */
function ratioName({ w, h }: Size): string {
  const ratio = w / h;
  const known: [number, string][] = [
    [1, "1:1"],
    [4 / 5, "4:5"],
    [3 / 4, "3:4"],
    [2 / 3, "2:3"],
    [9 / 16, "9:16"],
    [16 / 9, "16:9"],
    [1.91, "1.91:1"],
    [4 / 3, "4:3"],
    [3 / 2, "3:2"],
  ];
  const match = known.find(([r]) => Math.abs(r - ratio) < 0.02);
  return match ? match[1] : `${ratio.toFixed(2)}:1`;
}

/**
 * The post's photos and videos exactly as they were uploaded: nothing is
 * cropped. With several files, move between them with the arrows, by
 * clicking the left or right side of the picture, by swiping, with the
 * thumbnails, or with the arrow keys.
 *
 * The agency team, while the post is still being worked on, can also change
 * the order here (drag a thumbnail, or use Move earlier / Move later) and
 * write the caption and hashtags in the box underneath.
 */
export function PostPreview({
  itemId,
  media,
  caption,
  hashtags,
  canArrange = false,
  canEditCaption = false,
  hasPlatformCaptions = false,
}: {
  itemId: string;
  media: SignedMedia[];
  caption: string;
  hashtags?: string | null;
  /** The order can be changed (agency, post still in progress, latest version). */
  canArrange?: boolean;
  /** The caption and hashtags can be edited in place. */
  canEditCaption?: boolean;
  /** Instagram or Facebook has its own caption (set in the Edit form). */
  hasPlatformCaptions?: boolean;
}) {
  const [items, setItems] = useState(media);
  const [index, setIndex] = useState(0);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [saving, startSaving] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  // Which way the last move went: 1 forward, -1 back, 0 for a reorder (no animation).
  const flick = useRef(0);
  const firstShown = useRef(true);
  const reduce = useReducedMotion();
  const count = items.length;
  const at = Math.min(index, Math.max(count - 1, 0));
  const current = items[at];
  const size = current ? sizes[current.src] : undefined;

  const go = (to: number) => {
    const next = Math.min(count - 1, Math.max(0, to));
    if (next !== at) flick.current = next > at ? 1 : -1;
    setIndex(next);
  };

  // Carousels: the next photo comes forward off the stack; going back, the earlier one drops in from the front.
  useEffect(() => {
    if (firstShown.current) {
      firstShown.current = false;
      return;
    }
    const dir = flick.current;
    flick.current = 0;
    const node = frame.current;
    if (!node || !dir || reduce) return;
    const controls = animate(
      node,
      dir > 0
        ? { y: [-16, 0], scale: [0.93, 1], rotateX: [10, 0], opacity: [0.5, 1] }
        : { y: [24, 0], scale: [1.03, 1], rotateX: [-6, 0], opacity: [0, 1] },
      { type: "spring", stiffness: 340, damping: 30 },
    );
    return () => controls.stop();
  }, [at, reduce]);
  const measured = (src: string, w: number, h: number) => {
    if (w && h) setSizes((s) => (s[src]?.w === w && s[src]?.h === h ? s : { ...s, [src]: { w, h } }));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(at + 1);
    if (e.key === "ArrowLeft") go(at - 1);
  };
  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // A sideways swipe, not a scroll.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1));
  };

  /** Moves a file to a new place, shows it straight away, then saves the order. */
  function move(from: number, to: number) {
    if (!canArrange || saving || from === to || to < 0 || to >= count) return;
    const before = items;
    const next = items.slice();
    next.splice(to, 0, ...next.splice(from, 1));
    flick.current = 0;
    setItems(next);
    setIndex(to);
    startSaving(async () => {
      const result = await reorderMedia(itemId, next.map(keyOf)).catch(() => ({ error: "Couldn't reach the server." }) as const);
      if (result && "error" in result && result.error) {
        setItems(before);
        setIndex(from);
        toast.error(result.error);
      } else {
        toast.success(to === 0 ? "This one now comes first." : "Order saved.");
      }
    });
  }

  return (
    <div className="mx-auto w-full">
      {!current ? (
        <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-sunken text-faint">
          <ImageOff className="size-8" aria-hidden />
          <span className="text-xs">Media not uploaded yet</span>
        </div>
      ) : (
        <div className={cn("relative [perspective:1200px]", count > 1 && "mt-4")}>
          {/* The next photos wait behind, like a stack of prints. */}
          {count > 1
            ? [2, 1].map((depth) => {
                const m = items[at + depth];
                if (!m) return null;
                return (
                  <div
                    key={keyOf(m)}
                    aria-hidden
                    className="animate-fade-in pointer-events-none absolute inset-0 overflow-hidden rounded-2xl border border-line bg-sunken transition-[transform,opacity] duration-500 ease-out-expo"
                    style={{
                      transform: `translateY(${-depth * 8}px) scale(${1 - depth * 0.05})`,
                      transformOrigin: "50% 0%",
                      opacity: depth === 2 ? 0.75 : 1,
                    }}
                  >
                    {m.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.src} alt="" className="size-full object-cover" draggable={false} />
                    ) : null}
                    <span className="absolute inset-0 bg-ink/15" />
                  </div>
                );
              })
            : null}
          <div
            ref={frame}
            className={cn(
              "relative overflow-hidden rounded-2xl border border-line bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              count > 1 && "shadow-[0_14px_30px_-20px_rgb(29_27_22/0.45)]",
            )}
            tabIndex={count > 1 ? 0 : -1}
            role="group"
            aria-roledescription="carousel"
            aria-label={count > 1 ? `Photo ${at + 1} of ${count}` : "Post media"}
            onKeyDown={onKey}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="flex items-center justify-center">
              {current.kind === "video" ? (
                <video
                  key={current.src}
                  src={current.src}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[72vh] w-full"
                  onLoadedMetadata={(e) => measured(current.src, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
                />
              ) : current.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.src}
                  src={current.src}
                  alt={count > 1 ? `Photo ${at + 1} of ${count}` : "Post image"}
                  className="max-h-[72vh] w-auto max-w-full select-none"
                  draggable={false}
                  ref={(el) => {
                    if (el?.complete) measured(current.src, el.naturalWidth, el.naturalHeight);
                  }}
                  onLoad={(e) => measured(current.src, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                />
              ) : (
                <a href={current.src} className="flex aspect-[4/3] w-full items-center justify-center px-4 text-center text-sm text-ink underline">
                  {current.name}
                </a>
              )}
            </div>

            {count > 1 ? (
              <>
                {/* Click the left or right side of a photo to move (videos keep their own controls). */}
                {current.kind === "image" ? (
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      onClick={() => go(at - 1)}
                      className={cn("absolute inset-y-0 left-0 w-1/2", at === 0 ? "cursor-default" : "cursor-w-resize")}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      onClick={() => go(at + 1)}
                      className={cn("absolute inset-y-0 right-0 w-1/2", at === count - 1 ? "cursor-default" : "cursor-e-resize")}
                    />
                  </>
                ) : null}
                {at > 0 ? (
                  <button
                    type="button"
                    onClick={() => go(at - 1)}
                    className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-md transition hover:bg-white"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                ) : null}
                {at < count - 1 ? (
                  <button
                    type="button"
                    onClick={() => go(at + 1)}
                    className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-md transition hover:bg-white"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                ) : null}
                <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
                  {at + 1} / {count}
                </span>
              </>
            ) : null}
          </div>
        </div>
      )}

      {count > 1 ? (
        <>
          {/* One thumbnail per file, in posting order. Click to view; drag to reorder when allowed. */}
          <ol className="mt-2.5 flex flex-wrap justify-center gap-1.5" aria-label="Photos in posting order">
            {items.map((m, i) => (
              <li
                key={keyOf(m)}
                draggable={canArrange && !saving}
                onDragStart={(e) => {
                  setDragging(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragging !== null) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging !== null) move(dragging, i);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                className={cn("relative", canArrange && !saving && "cursor-grab active:cursor-grabbing", dragging === i && "opacity-40")}
              >
                <button
                  type="button"
                  onClick={() => go(i)}
                  className={cn(
                    "block size-12 overflow-hidden rounded-lg border-2 bg-sunken transition",
                    i === at ? "border-accent" : "border-transparent opacity-70 hover:opacity-100",
                  )}
                  aria-label={`Photo ${i + 1} of ${count}${i === 0 ? " (first)" : ""}`}
                  aria-current={i === at}
                >
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.src} alt="" className="size-full object-cover" draggable={false} />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted">
                      <Film className="size-4" aria-hidden />
                    </span>
                  )}
                </button>
                <span className="pointer-events-none absolute -top-1 -left-1 flex size-4 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-white tabular-nums">
                  {i + 1}
                </span>
              </li>
            ))}
          </ol>

          {canArrange ? (
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              <button type="button" onClick={() => move(at, at - 1)} disabled={saving || at === 0} className={buttonClass("secondary", "sm")}>
                <ArrowLeft className="size-3.5" aria-hidden /> Move earlier
              </button>
              <button type="button" onClick={() => move(at, at + 1)} disabled={saving || at === count - 1} className={buttonClass("secondary", "sm")}>
                Move later <ArrowRight className="size-3.5" aria-hidden />
              </button>
              <button type="button" onClick={() => move(at, 0)} disabled={saving || at === 0} className={buttonClass("ghost", "sm")}>
                Make first
              </button>
              {saving ? <Loader2 className="size-4 animate-spin text-muted" aria-label="Saving the order" /> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {size ? (
        <p className="mt-2 text-center text-xs text-faint tabular-nums">
          {size.w} × {size.h} · {ratioName(size)}
        </p>
      ) : null}

      {canEditCaption ? (
        <CaptionEditor itemId={itemId} caption={caption} hashtags={hashtags ?? ""} hasPlatformCaptions={hasPlatformCaptions} />
      ) : (
        <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3">
          <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink">{caption || <span className="text-faint">No caption yet</span>}</p>
          {hashtags ? <p className="mt-1.5 text-[13px] leading-relaxed text-[#00376b]">{hashtags}</p> : null}
        </div>
      )}
    </div>
  );
}

/** The caption and hashtags, typed straight into the box under the preview. */
function CaptionEditor({
  itemId,
  caption,
  hashtags,
  hasPlatformCaptions,
}: {
  itemId: string;
  caption: string;
  hashtags: string;
  hasPlatformCaptions: boolean;
}) {
  const [saved, setSaved] = useState({ caption, hashtags });
  const [text, setText] = useState(caption);
  const [tags, setTags] = useState(hashtags);
  const [saving, startSaving] = useTransition();
  const dirty = text.trim() !== saved.caption.trim() || tags.trim() !== saved.hashtags.trim();

  function save() {
    startSaving(async () => {
      const result = await saveCaption(itemId, text, tags).catch(() => ({ error: "Couldn't reach the server." }) as const);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setSaved({ caption: text, hashtags: tags });
      toast.success("Caption saved.");
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-3 focus-within:border-line-strong">
      <label className="sr-only" htmlFor="inline-caption">
        Caption
      </label>
      <textarea
        id="inline-caption"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && dirty && !saving) save();
        }}
        rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
        maxLength={5000}
        placeholder="Write the caption…"
        className="block w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
      <label className="sr-only" htmlFor="inline-hashtags">
        Hashtags
      </label>
      <input
        id="inline-hashtags"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        maxLength={1000}
        placeholder="#hashtags"
        className="mt-1.5 block w-full border-t border-line bg-transparent pt-2 text-[13px] text-[#00376b] outline-none placeholder:text-faint"
      />
      {hasPlatformCaptions ? (
        <p className="mt-2 text-xs text-muted">Instagram or Facebook has its own caption for this post. Change those under Edit.</p>
      ) : null}
      {dirty ? (
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setText(saved.caption);
              setTags(saved.hashtags);
            }}
            disabled={saving}
            className={buttonClass("ghost", "sm")}
          >
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className={buttonClass("primary", "sm")}>
            {saving ? "Saving…" : "Save caption"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
