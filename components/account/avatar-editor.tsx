"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { uploadFiles } from "@/lib/upload";
import { discardUploads } from "@/app/actions/files";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Camera, Loader2, Minus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { setAvatar } from "@/app/actions/account";
import { AVATAR_SIZE } from "@/lib/avatar";
import { newId } from "@/lib/chat";
import { Avatar, buttonClass } from "@/components/ui";

const VIEW = 256; // crop window, CSS pixels
const MAX_ZOOM = 4;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

type Picked = { src: string; width: number; height: number; image: HTMLImageElement };

/**
 * Profile picture: shows the current one, lets people pick a new photo, frame
 * it (drag to move, slider to zoom) and save it as a square JPEG, or remove it.
 */
export function AvatarEditor({ userId, name, url }: { userId: string; name: string; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const base = picked ? VIEW / Math.min(picked.width, picked.height) : 1;
  const scale = base * zoom;

  function clamp(next: { x: number; y: number }, z = zoom) {
    if (!picked) return next;
    const s = base * z;
    const maxX = Math.max(0, (picked.width * s - VIEW) / 2);
    const maxY = Math.max(0, (picked.height * s - VIEW) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Choose an image file, such as a JPG or PNG.");
    if (file.size > MAX_INPUT_BYTES) return void toast.error("That image is over 20 MB. Choose a smaller one.");
    const src = URL.createObjectURL(file);
    const image = new Image();
    image.src = src;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(src);
      return void toast.error("That image couldn't be opened. Try a JPG or PNG.");
    }
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setPicked({ src, width: image.naturalWidth, height: image.naturalHeight, image });
  }

  function close() {
    if (picked) URL.revokeObjectURL(picked.src);
    setPicked(null);
    if (input.current) input.current.value = "";
  }

  function setZoomTo(z: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setOffset((o) => clamp(o, next));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 20 : 6;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setOffset((o) => clamp({ x: o.x + move[0], y: o.y + move[1] }));
    } else if (e.key === "+" || e.key === "=") setZoomTo(zoom + 0.2);
    else if (e.key === "-") setZoomTo(zoom - 0.2);
  }

  /** Draws the framed square at AVATAR_SIZE and uploads it. */
  async function save() {
    if (!picked) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser couldn't prepare the picture.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
      ctx.imageSmoothingQuality = "high";
      const size = VIEW / scale;
      const sx = (picked.width * scale - VIEW) / 2 / scale - offset.x / scale;
      const sy = (picked.height * scale - VIEW) / 2 / scale - offset.y / scale;
      ctx.drawImage(picked.image, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Your browser couldn't prepare the picture.");

      const path = `${userId}/${newId()}.jpg`;
      const { failed } = await uploadFiles({ scope: "avatar" }, [{ path, file: blob, type: "image/jpeg" }]);
      if (failed.size) throw new Error(failed.get(path));
      const result = await setAvatar(path);
      if (!result.ok) {
        await discardUploads({ scope: "avatar" }, [path]);
        throw new Error(result.error ?? "The picture couldn't be saved.");
      }
      toast.success("Profile picture updated.");
      close();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The picture couldn't be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setRemoving(true);
    const result = await setAvatar(null);
    setRemoving(false);
    if (result.ok) {
      toast.success("Profile picture removed.");
      router.refresh();
    } else toast.error(result.error ?? "The picture couldn't be removed.");
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:w-40 sm:shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full focus-visible:ring-4 focus-visible:ring-accent/30"
        aria-label={url ? "Change profile picture" : "Add a profile picture"}
      >
        <Avatar name={name} src={url} size="xl" className="ring-4 ring-surface" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-6" aria-hidden />
        </span>
        <span className="absolute right-0.5 bottom-0.5 flex size-8 items-center justify-center rounded-full bg-accent text-white shadow-md ring-2 ring-surface">
          <Camera className="size-4" aria-hidden />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      <div className="flex flex-wrap justify-center gap-1.5">
        <button type="button" onClick={() => input.current?.click()} className={buttonClass("secondary", "sm")}>
          {url ? "Change photo" : "Upload photo"}
        </button>
        {url ? (
          <button type="button" onClick={() => void remove()} disabled={removing} className={buttonClass("ghost", "sm", "text-muted")} aria-label="Remove profile picture">
            {removing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
            <span className="sm:sr-only">Remove</span>
          </button>
        ) : null}
      </div>
      <p className="text-center text-xs text-muted">JPG, PNG or WebP. You can frame it next.</p>

      <Dialog.Root open={Boolean(picked)} onOpenChange={(open) => !open && !saving && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" />
          <Dialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 w-[min(360px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-2xl outline-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-base font-semibold text-ink">Frame your photo</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-muted">Drag to move it. Use the slider to zoom.</Dialog.Description>
              </div>
              <Dialog.Close className="-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label="Cancel" disabled={saving}>
                <X className="size-4" aria-hidden />
              </Dialog.Close>
            </div>

            {picked ? (
              <div
                role="application"
                aria-label="Photo framing. Use the arrow keys to move the photo, plus and minus to zoom."
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onKeyDown={onKeyDown}
                onWheel={(e) => setZoomTo(zoom - e.deltaY * 0.002)}
                className="relative mx-auto mt-4 cursor-grab touch-none overflow-hidden rounded-xl bg-ink outline-none select-none focus-visible:ring-4 focus-visible:ring-accent/30 active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file */}
                <img
                  src={picked.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
                  style={{
                    width: picked.width * scale,
                    height: picked.height * scale,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }}
                />
                {/* Darken everything outside the circle that will be shown. */}
                <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(29,27,22,0.55)] ring-2 ring-white/80" />
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={() => setZoomTo(zoom - 0.25)} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label="Zoom out">
                <Minus className="size-4" aria-hidden />
              </button>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoomTo(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-[var(--color-accent)]"
                aria-label="Zoom"
              />
              <button type="button" onClick={() => setZoomTo(zoom + 0.25)} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label="Zoom in">
                <Plus className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} disabled={saving} className={buttonClass("secondary", "md")}>
                Cancel
              </button>
              <button type="button" onClick={() => void save()} disabled={saving} className={buttonClass("primary", "md")}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
                  </>
                ) : (
                  "Save photo"
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
