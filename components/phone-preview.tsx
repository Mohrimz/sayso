import { Bookmark, Heart, MessageCircle, Send, ImageOff } from "lucide-react";
import type { SignedMedia } from "@/lib/media";
import type { ContentType } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

/**
 * A phone-sized preview of the post as it will appear on Instagram-style
 * feeds. Carousels swipe with native scroll snapping; no client JS needed.
 */
export function PhonePreview({
  type,
  media,
  handle,
  caption,
  hashtags,
  onScreenText,
}: {
  type: ContentType;
  media: SignedMedia[];
  handle: string;
  caption: string;
  hashtags?: string | null;
  onScreenText?: string | null;
}) {
  const vertical = type === "reel" || type === "story";
  const name = handle.replace(/^@/, "") || "yourbrand";

  return (
    <div className="mx-auto w-full max-w-[340px]">
      <div className="overflow-hidden rounded-[2.2rem] border-[7px] border-ink bg-ink shadow-xl shadow-black/10">
        <div className="relative bg-white">
          {!vertical ? (
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600 p-[2px]">
                <span className="flex size-full items-center justify-center rounded-full bg-white text-[9px] font-bold text-ink">
                  {initials(name.replace(/[._]/g, " ")) || "B"}
                </span>
              </span>
              <span className="text-[13px] font-semibold text-ink">{name}</span>
            </div>
          ) : null}

          <MediaStrip media={media} vertical={vertical} onScreenText={onScreenText} />

          {vertical ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-10 pb-3 text-white">
              <div className="text-[13px] font-semibold">{name}</div>
              {caption ? <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug opacity-95">{caption}</p> : null}
            </div>
          ) : (
            <div className="px-3 pt-2.5 pb-4">
              <div className="flex items-center gap-3.5 text-ink">
                <Heart className="size-[22px]" aria-hidden />
                <MessageCircle className="size-[22px]" aria-hidden />
                <Send className="size-[22px]" aria-hidden />
                <Bookmark className="ml-auto size-[22px]" aria-hidden />
              </div>
              <p className="mt-2 text-[13px] leading-snug whitespace-pre-line text-ink">
                <span className="font-semibold">{name}</span> {caption || <span className="text-faint">No caption yet</span>}
              </p>
              {hashtags ? <p className="mt-1 text-[13px] leading-snug text-[#00376b]">{hashtags}</p> : null}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-faint">Preview. The final post may look slightly different on each app.</p>
    </div>
  );
}

function MediaStrip({
  media,
  vertical,
  onScreenText,
}: {
  media: SignedMedia[];
  vertical: boolean;
  onScreenText?: string | null;
}) {
  const aspect = vertical ? "aspect-[9/16]" : "aspect-[4/5]";
  if (!media.length) {
    return (
      <div className={cn(aspect, "flex flex-col items-center justify-center gap-2 bg-sunken text-faint")}>
        <ImageOff className="size-8" aria-hidden />
        <span className="text-xs">Media not uploaded yet</span>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className={cn("scroll-thin flex snap-x snap-mandatory overflow-x-auto", aspect)}>
        {media.map((m, i) => (
          <div key={m.src} className="relative h-full w-full shrink-0 snap-center bg-black">
            {m.kind === "video" ? (
              <video src={m.src} controls playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : m.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.src} alt={`Slide ${i + 1} of ${media.length}`} className="h-full w-full object-cover" />
            ) : (
              <a href={m.src} className="flex h-full items-center justify-center text-sm text-white underline">
                {m.name}
              </a>
            )}
          </div>
        ))}
      </div>
      {onScreenText ? (
        <div className="pointer-events-none absolute inset-x-4 top-1/3 text-center text-lg font-bold leading-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
          {onScreenText}
        </div>
      ) : null}
      {media.length > 1 ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
          {media.length} slides · swipe
        </div>
      ) : null}
    </div>
  );
}
