"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/*
 * Entrance animations use CSS (see globals.css), so content is visible and
 * animating as soon as the HTML arrives, even before JavaScript has loaded.
 * Motion is used for interactive animations (menus, tabs, drawers, counters).
 */

/**
 * Pages come into focus as they open. The animation sits on the wrapper's
 * children, so it also plays when a loading skeleton is swapped for the page.
 */
export function PageEnter({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}

export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={cn("animate-rise", className)} style={delay ? { animationDelay: `${delay}s` } : undefined}>
      {children}
    </div>
  );
}

/** Children appear one after another. Use with StaggerItem. */
export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  const Tag = as;
  return <Tag className={cn("stagger", className)}>{children}</Tag>;
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Tag = as;
  return <Tag className={className}>{children}</Tag>;
}

/** Counts up to a number when it first appears (shows the final number before JavaScript loads). */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node || reduce) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value}
    </span>
  );
}

/** A progress bar whose coloured segments grow in on load. */
export function AnimatedBar({
  segments,
  className,
  label,
}: {
  segments: { value: number; className: string }[];
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("flex h-2.5 overflow-hidden rounded-full bg-sunken", className)} role="img" aria-label={label}>
      {segments.map((s, i) => (
        <span
          key={i}
          className={cn("animate-grow-x h-full", s.className)}
          style={{ width: `${Math.max(0, Math.min(100, s.value))}%`, animationDelay: `${0.15 + i * 0.12}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Friendly empty state with a tick that draws itself. */
export function CaughtUp({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <svg viewBox="0 0 48 48" className="animate-pop-in size-12 text-emerald-600" aria-hidden>
        <circle cx="24" cy="24" r="22" className="fill-emerald-50" />
        <path
          d="M15 24.5l6 6 12-13"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw-check"
        />
      </svg>
      <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-xs text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/** Small celebration when a client approves. */
export async function celebrate() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#ff5b2e", "#f59e0b", "#22c55e", "#17151c"];
  confetti({ particleCount: 70, spread: 70, startVelocity: 38, origin: { x: 0.5, y: 0.75 }, colors, ticks: 160 });
  setTimeout(() => confetti({ particleCount: 40, spread: 100, startVelocity: 28, origin: { x: 0.5, y: 0.7 }, colors, ticks: 140 }), 180);
}
