"use client";

import { useEffect } from "react";

/**
 * Makes every element marked `data-tilt` lean toward the mouse and catch the
 * light (the look is in globals.css). One listener for the whole app, so cards
 * in server components only need the attribute. `data-tilt="10"` sets the
 * strongest lean in degrees (default 7). Mouse only, and never with reduced motion.
 */
export function TiltLayer() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let current: HTMLElement | null = null;
    let last: PointerEvent | null = null;
    let frame = 0;

    const release = () => {
      if (!current) return;
      current.removeAttribute("data-tilting");
      current = null;
    };

    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tilt]") : null;
      if (el !== current) release();
      if (!el) return;
      current = el;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const max = Number(el.dataset.tilt) || 7;
      el.style.setProperty("--tilt-x", `${((0.5 - y) * max).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${((x - 0.5) * max).toFixed(2)}deg`);
      el.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
      el.setAttribute("data-tilting", "");
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || calm.matches) return release();
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // Pressing a card settles it, so the click lands on a still target.
    const onDown = () => release();

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", release);
    window.addEventListener("blur", release);
    return () => {
      cancelAnimationFrame(frame);
      release();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", release);
      window.removeEventListener("blur", release);
    };
  }, []);
  return null;
}
