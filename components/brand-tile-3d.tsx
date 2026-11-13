"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The tile's thickness: stacked layers behind the face make a solid edge.
const EDGE_LAYERS = 12;
const DEPTH_PX = 15;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * The client's logo as a thick glossy tile that turns to face the mouse and
 * catches the light (on phones, and when the mouse is still, it sways
 * slowly). Pure CSS 3D, so it costs about as much as an image. Shows the
 * client's initials when there's no logo yet.
 */
export function BrandTile3D({ name, logo, className }: { name: string; logo: string | null; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const tile = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  // If the logo can't be loaded, show the initials rather than a broken picture.
  const [failed, setFailed] = useState<string | null>(null);
  const showLogo = logo && failed !== logo;

  useEffect(() => {
    const box = host.current;
    const t = tile.current;
    if (!box || !t) return;
    const pose = (rx: number, ry: number, s: number) => {
      t.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(3)})`;
      t.style.setProperty("--gx", `${(50 + ry * 2.4).toFixed(1)}%`);
      t.style.setProperty("--gy", `${(40 - rx * 2.4).toFixed(1)}%`);
      if (glow.current) glow.current.style.transform = `translateX(${(-ry * 0.8).toFixed(1)}px)`;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pose(8, -16, 1);
      return;
    }

    const aim = { x: 0, y: 0 };
    let movedAt = -Infinity;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = box.getBoundingClientRect();
      aim.x = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2));
      aim.y = clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2));
      movedAt = performance.now();
    };

    // Starts turned away and small, then swings round to face you.
    const look = { rx: 18, ry: -85, s: 0.82 };
    const startedAt = performance.now();
    let last = startedAt;
    let frame = 0;
    let visible = true;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - startedAt) / 1000;
      const still = now - movedAt > 2500;
      const target = still ? { rx: 5 + Math.sin(time * 0.5 + 1) * 5, ry: -8 + Math.sin(time * 0.62) * 16 } : { rx: 4 - aim.y * 16, ry: aim.x * 26 };
      const k = 1 - Math.pow(1 - (time < 1.4 ? 0.075 : 0.06), dt * 60);
      look.rx += (target.rx - look.rx) * k;
      look.ry += (target.ry - look.ry) * k;
      look.s += (1 - look.s) * k;
      pose(look.rx, look.ry, look.s);
      frame = visible && !document.hidden ? requestAnimationFrame(step) : 0;
    };
    const resume = () => {
      if (!frame && visible && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    };
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      resume();
    });
    seen.observe(box);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", resume);
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div ref={host} aria-hidden className={cn("relative shrink-0 [perspective:520px]", className)}>
      {/* Warm light pooled under the tile. */}
      <div ref={glow} className="absolute inset-x-[12%] -bottom-[14%] h-[22%] rounded-[50%] bg-[#ff5b2e]/30 blur-xl" />
      <div
        ref={tile}
        className="relative size-full [transform-style:preserve-3d] will-change-transform"
        style={{ transform: "rotateX(18deg) rotateY(-85deg) scale(0.82)" }}
      >
        {Array.from({ length: EDGE_LAYERS }, (_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-[24%]"
            style={{
              transform: `translateZ(${(-((i + 1) * DEPTH_PX) / EDGE_LAYERS).toFixed(2)}px)`,
              background: `linear-gradient(160deg, ${i < 3 ? "#4a4550" : "#34303a"}, #17151c)`,
            }}
          />
        ))}
        <div className="absolute inset-0 overflow-hidden rounded-[24%] bg-surface shadow-[inset_0_1px_0_rgb(255_255_255/0.7),inset_0_0_0_1px_rgb(23_21_28/0.08)]">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the client's logo from storage
            <img src={logo} alt="" className="size-full object-cover" draggable={false} onError={() => setFailed(logo)} />
          ) : (
            <span className="flex size-full items-center justify-center bg-[#f6f1e7] font-display text-[2.4rem] font-bold tracking-tight text-[#cf4318]">
              {initials}
            </span>
          )}
          {/* The light it catches. */}
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--gx,40%)_var(--gy,30%),rgb(255_255_255/0.5),rgb(255_255_255/0)_55%)] mix-blend-soft-light" />
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--gx,40%)_var(--gy,30%),rgb(255_255_255/0.22),rgb(255_255_255/0)_45%)]" />
        </div>
      </div>
    </div>
  );
}
