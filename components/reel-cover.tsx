"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/lib/upload";
import { markCoverSet, setCoverFrame, setReelCover } from "@/app/actions/content";
import { safeName } from "@/components/media-uploader";
import { Card, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/app/actions/types";

const COVER_MAX_BYTES = 20 * 1024 * 1024;

export type CoverImage = { src: string; download: string; name: string };

function clock(ms: number) {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * A reel's cover: the image the team uploaded (shown to the client, set in
 * Instagram and Facebook after publishing) and the video frame Instagram uses
 * when Sayso publishes it. Both can change right up to publishing.
 */
export function ReelCover({
  itemId,
  workspaceId,
  cover,
  frameMs,
  videoSrc,
  canEdit,
}: {
  itemId: string;
  workspaceId: string;
  cover: CoverImage | null;
  frameMs: number | null;
  videoSrc: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();

  if (!cover && !canEdit) return null;

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("The cover must be an image (JPG or PNG).");
    if (file.size > COVER_MAX_BYTES) return void toast.error("The cover can be up to 20 MB.");
    setUploading(true);
    try {
      const path = `${workspaceId}/${itemId}/cover/${crypto.randomUUID()}/${safeName(file.name)}`;
      const { failed, error } = await uploadFiles({ scope: "content", itemId }, [{ path, file }]);
      if (error || failed.size) throw new Error(error ?? failed.get(path) ?? "Upload failed.");
      const result = await setReelCover(itemId, { path, name: file.name, mime: file.type, size: file.size });
      if (!result?.ok) throw new Error(result?.error ?? "The cover couldn't be saved.");
      toast.success(result.message);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  function run(action: () => Promise<ActionState>, after?: () => void) {
    start(async () => {
      const result = await action();
      if (!result?.ok) return void toast.error(result?.error ?? "That didn't work.");
      toast.success(result.message);
      after?.();
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
      <div className="flex items-start gap-3">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived storage link
          <img src={cover.src} alt="Reel cover" className="aspect-[9/16] w-20 shrink-0 rounded-lg object-cover ring-1 ring-line" />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading}
            className="flex aspect-[9/16] w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong bg-sunken/50 text-muted transition hover:border-accent hover:text-accent"
            aria-label="Upload a cover image"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Cover</p>
          <p className="mt-0.5 text-xs text-muted">
            {cover ? "Set on Instagram and Facebook after publishing." : "Upload the image this reel should open with. 9:16 works best."}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {cover ? (
              <a href={cover.download} download={cover.name} className={buttonClass("secondary", "sm")}>
                <Download className="size-3.5" aria-hidden /> Download
              </a>
            ) : null}
            {canEdit ? (
              <button type="button" onClick={() => input.current?.click()} disabled={uploading || pending} className={buttonClass(cover ? "secondary" : "primary", "sm")}>
                {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ImagePlus className="size-3.5" aria-hidden />}
                {cover ? "Replace" : "Upload cover"}
              </button>
            ) : null}
            {canEdit && cover ? (
              <button
                type="button"
                onClick={() => run(() => setReelCover(itemId, null))}
                disabled={uploading || pending}
                className={buttonClass("ghost", "sm")}
                aria-label="Remove the cover"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {canEdit && videoSrc ? (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Instagram cover frame</p>
              <p className="text-xs text-muted">
                {frameMs === null ? "The first frame. Sent when Sayso publishes." : `At ${clock(frameMs)}. Sent when Sayso publishes.`}
              </p>
            </div>
            {!picking ? (
              <button type="button" onClick={() => setPicking(true)} className={buttonClass("secondary", "sm")}>
                Choose
              </button>
            ) : null}
          </div>
          {picking ? (
            <div className="mt-3 space-y-2">
              <video
                ref={video}
                src={frameMs !== null ? `${videoSrc}#t=${frameMs / 1000}` : videoSrc}
                controls
                muted
                playsInline
                preload="metadata"
                className="aspect-[9/16] max-h-80 w-full rounded-lg bg-black object-contain"
              />
              <p className="text-xs text-muted">Pause on the frame you want, then save it.</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const at = video.current?.currentTime ?? 0;
                    run(() => setCoverFrame(itemId, Math.round(at * 1000)), () => setPicking(false));
                  }}
                  className={buttonClass("primary", "sm")}
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                  Use this frame
                </button>
                {frameMs !== null ? (
                  <button type="button" disabled={pending} onClick={() => run(() => setCoverFrame(itemId, null), () => setPicking(false))} className={buttonClass("ghost", "sm")}>
                    Use the first frame
                  </button>
                ) : null}
                <button type="button" onClick={() => setPicking(false)} className={buttonClass("ghost", "sm")}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * After a reel with a cover image goes live: Make can't send custom covers, so
 * the team sets it in the apps. Stays until someone confirms it's done.
 */
export function CoverReminder({ itemId, cover }: { itemId: string; cover: CoverImage }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card className="border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived storage link */}
        <img src={cover.src} alt="" className="aspect-[9/16] w-14 shrink-0 rounded-md object-cover ring-1 ring-line" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Now set the cover</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] text-ink-soft">
            <li>Download the cover to your phone.</li>
            <li>
              Instagram app, on the client&apos;s account: open the reel, tap <span className="font-medium">⋯</span>, then{" "}
              <span className="font-medium">Edit</span> and <span className="font-medium">Edit cover</span>, and add the image.
            </li>
            <li>
              Facebook: in Meta Business Suite open <span className="font-medium">Content</span>, then the reel, then{" "}
              <span className="font-medium">⋯ Edit</span>, and change the cover if it&apos;s offered.
            </li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <a href={cover.download} download={cover.name} className={buttonClass("primary", "sm")}>
              <Download className="size-3.5" aria-hidden /> Download cover
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await markCoverSet(itemId);
                  if (!result?.ok) return void toast.error(result?.error ?? "That didn't work.");
                  toast.success(result.message);
                  router.refresh();
                })
              }
              className={cn(buttonClass("secondary", "sm"))}
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              Done, it&apos;s set
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
