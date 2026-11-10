"use client";

import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { Building2, Check, CheckCircle2, Eye, Send, ShieldCheck, Smartphone } from "lucide-react";
import { Wordmark } from "@/components/logo";
import { Mark3D } from "@/components/mark-3d";
import { APP_TAGLINE } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Deep charcoal with two slow glows (ember and amber) and a fine grain. */
function Backdrop({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0d0c11]">
      {compact ? (
        <>
          <div className="animate-drift-a absolute -top-28 -left-24 size-[22rem] rounded-full bg-[#d9381a]/40 blur-[80px]" />
          <div className="animate-drift-b absolute -right-28 -bottom-40 size-[18rem] rounded-full bg-[#f59e0b]/25 blur-[80px]" />
        </>
      ) : (
        <>
          <div className="animate-drift-a absolute -top-[22%] -left-[18%] size-[40rem] rounded-full bg-[#d9381a]/30 blur-[120px]" />
          <div className="animate-drift-b absolute -right-[22%] -bottom-[28%] size-[38rem] rounded-full bg-[#f59e0b]/[0.14] blur-[120px]" />
        </>
      )}
      <div className="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_30%_40%,black_20%,transparent_70%)]" />
      <div className="grain absolute inset-0 opacity-[0.06] mix-blend-overlay" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </div>
  );
}

/** The tagline, revealed word by word; the last word is set in an italic serif. */
function Tagline({ delay = 0.1 }: { delay?: number }) {
  const words = APP_TAGLINE.split(" ");
  return words.map((word, i) => {
    const last = i === words.length - 1;
    return (
      <Fragment key={i}>
        <span className="word-reveal">
          <span
            style={{ animationDelay: `${delay + i * 0.06}s` }}
            className={
              last
                ? "bg-gradient-to-r from-[#fde7d4] via-[#ffb48a] to-[#ffd27a] bg-clip-text pe-[0.08em] font-serif text-[1.12em] font-normal tracking-normal text-transparent italic"
                : undefined
            }
          >
            {word}
          </span>
        </span>
        {last ? null : " "}
      </Fragment>
    );
  });
}

/* ---- The approval story: draft → review → client approves → live, on a loop ---- */

type Phase = 0 | 1 | 2 | 3 | 4;
const PHASE_MS: Record<Phase, number> = { 0: 2000, 1: 1700, 2: 1350, 3: 2400, 4: 2800 };
const STEPS = ["Planned", "Created", "Reviewed", "Approved", "Live"] as const;
const STEP_FOR: Record<Phase, number> = { 0: 1, 1: 2, 2: 2, 3: 3, 4: 4 };
const CHIP: Record<Phase, { label: string; className: string }> = {
  0: { label: "Draft", className: "bg-stone-100 text-stone-600 ring-stone-200" },
  1: { label: "Awaiting approval", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  2: { label: "Awaiting approval", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  3: { label: "Approved", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  4: { label: "Live", className: "bg-stone-900 text-white ring-stone-900" },
};
const SOFT = { type: "spring", visualDuration: 0.45, bounce: 0.15 } as const;

/** Steps through the story. Starts (and, with reduced motion, stays) on "awaiting approval". */
function useStory(): Phase {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(1);
  useEffect(() => {
    if (reduce) return;
    let current: Phase = 1;
    let timer = setTimeout(function next() {
      current = ((current + 1) % 5) as Phase;
      setPhase(current);
      timer = setTimeout(next, PHASE_MS[current]);
    }, PHASE_MS[1]);
    return () => clearTimeout(timer);
  }, [reduce]);
  return phase;
}

function PostImage() {
  return (
    <div className="relative aspect-square w-[7.25rem] shrink-0 overflow-hidden rounded-xl bg-[radial-gradient(120%_95%_at_30%_15%,#fde9cf_0%,#f0b989_40%,#b4633a_75%,#4f2414_100%)]">
      <div className="absolute top-3.5 left-1/2 size-12 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff7ea,#f3c48f_45%,#c27440_82%)] shadow-[0_10px_20px_-6px_rgba(79,36,20,0.8)]" />
      <div className="absolute inset-x-0 bottom-2.5 text-center text-white">
        <p className="font-serif text-[17px] leading-none italic">Pumpkin spice</p>
        <p className="mt-1 text-[6.5px] font-semibold tracking-[0.32em] text-white/75 uppercase">Bloom Bakery</p>
      </div>
    </div>
  );
}

/** A client's cursor that glides to "Approve" and clicks it. */
function Cursor({ phase }: { phase: Phase }) {
  const glide = { type: "spring", visualDuration: 0.8, bounce: 0.12 } as const;
  const click = { duration: PHASE_MS[2] / 1000, times: [0, 0.74, 0.8, 0.92] };
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-[55%] left-[58%] z-10 flex items-start"
      initial={false}
      animate={
        phase === 2
          ? { x: 0, y: 0, opacity: 1, scale: [1, 1, 0.82, 1] }
          : phase === 3
            ? { x: 0, y: 0, opacity: 0, scale: 1 }
            : { x: 170, y: 64, opacity: 0, scale: 1 }
      }
      transition={
        phase === 2
          ? { x: glide, y: glide, opacity: { duration: 0.25 }, scale: click }
          : phase === 3
            ? { opacity: { duration: 0.35, delay: 0.55 } }
            : { duration: 0 }
      }
    >
      <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]">
        <path d="M1.5 1.5l14 7.2-6.2 1.6-3 6.2z" fill="#1d1b16" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="mt-3.5 -ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white shadow-sm">Chloe</span>
    </motion.span>
  );
}

function Actions({ phase }: { phase: Phase }) {
  const kind = phase === 0 ? "writing" : phase === 4 ? "live" : "review";
  const approved = phase >= 3;
  return (
    <div className="mt-3 h-8">
      <AnimatePresence mode="wait" initial={false}>
        {kind === "writing" ? (
          <motion.p
            key="writing"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex h-8 items-center gap-2 text-[12px] text-stone-500"
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-stone-200 text-[9px] font-bold text-stone-700">AA</span>
            Ava is writing the caption
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1 rounded-full bg-stone-400"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </span>
          </motion.p>
        ) : kind === "review" ? (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2"
          >
            <span className="relative">
              <motion.span
                initial={false}
                animate={phase === 2 ? { scale: [1, 1, 0.93, 1] } : { scale: 1 }}
                transition={phase === 2 ? { duration: PHASE_MS[2] / 1000, times: [0, 0.74, 0.8, 0.92] } : SOFT}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold text-white shadow-sm transition-colors duration-300",
                  approved ? "bg-emerald-600" : "bg-accent",
                )}
              >
                {approved ? <Check className="size-3.5" aria-hidden /> : null}
                {approved ? "Approved" : "Approve"}
              </motion.span>
              <Cursor phase={phase} />
            </span>
            <span
              className={cn(
                "inline-flex h-8 items-center rounded-lg border border-stone-200 px-3 text-[12px] font-medium text-stone-600 transition-opacity duration-300",
                approved && "opacity-0",
              )}
            >
              Request changes
            </span>
          </motion.div>
        ) : (
          <motion.p
            key="live"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex h-8 items-center gap-3 text-[12px] text-stone-500"
          >
            <span className="inline-flex items-center gap-1.5 font-medium text-stone-800">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative size-2 rounded-full bg-emerald-500" />
              </span>
              Posted
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden /> 1.2k reach
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toast({ phase }: { phase: Phase }) {
  const show = phase === 3 || phase === 4;
  return (
    <div className="pointer-events-none absolute -top-11 -right-4 z-20 xl:-right-12">
      <AnimatePresence mode="wait" initial={false}>
        {show ? (
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={SOFT}
            className="flex w-56 items-center gap-2.5 rounded-xl border border-white/60 bg-white/95 p-2.5 text-stone-900 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)] backdrop-blur"
          >
            {phase === 3 ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">CB</span>
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white">
                <Send className="size-3.5" aria-hidden />
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-[12px] leading-tight font-semibold">{phase === 3 ? "Chloe approved your post" : "Published to Instagram"}</span>
              <span className="block text-[11px] text-stone-500">{phase === 3 ? "Bloom Bakery · just now" : "Fri 14 Nov · 09:00"}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.045] px-6 pt-3.5 pb-3 backdrop-blur-md">
      <div className="relative">
        <div className="absolute top-[6px] h-px w-full bg-white/15" />
        <motion.div
          className="absolute top-[6px] h-px w-full origin-left bg-gradient-to-r from-[#ff8a5b] via-[#ffb547] to-[#fde7d4]"
          initial={false}
          animate={{ scaleX: step / (STEPS.length - 1) }}
          transition={{ type: "spring", visualDuration: 0.6, bounce: 0 }}
        />
        <ol className="relative flex justify-between">
          {STEPS.map((s, i) => (
            <li key={s} className="flex w-0 flex-col items-center">
              <span
                className={cn(
                  "size-[13px] rounded-full border transition-all duration-500",
                  i < step
                    ? "border-[#ffb48a] bg-[#ffb48a]"
                    : i === step
                      ? "border-white bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.12),0_0_16px_rgba(255,138,91,0.7)]"
                      : "border-white/25 bg-[#16141c]",
                )}
              />
              <span className={cn("mt-2 text-[11px] whitespace-nowrap transition-colors duration-500", i <= step ? "text-white/85" : "text-white/35")}>
                {s}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ApprovalStory() {
  const phase = useStory();
  const chip = CHIP[phase];
  return (
    <div className="relative w-full max-w-[440px]" aria-hidden>
      <div className="relative rounded-2xl bg-white p-4 text-stone-900 shadow-[0_40px_90px_-25px_rgba(0,0,0,0.75)] ring-1 ring-black/5">
        <Toast phase={phase} />
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 text-[9px] font-bold text-white">
              BB
            </span>
            <span className="leading-tight">
              <span className="block text-[12px] font-semibold">bloombakery</span>
              <span className="block text-[10.5px] text-stone-500">Feed post · Fri 14 Nov, 09:00</span>
            </span>
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={chip.label}
              initial={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
              transition={SOFT}
              className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", chip.className)}
            >
              {phase === 3 ? <CheckCircle2 className="size-3" aria-hidden /> : null}
              {chip.label}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="flex gap-3.5">
          <PostImage />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[14px] font-semibold tracking-tight">Pumpkin spice croissant</p>
            <div className="mt-1.5 h-[3.25rem]">
              <AnimatePresence mode="wait" initial={false}>
                {phase === 0 ? (
                  <motion.div key="draft" className="space-y-2 pt-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span className="skeleton block h-2.5 rounded-full" />
                    <span className="skeleton block h-2.5 w-4/5 rounded-full" />
                    <span className="skeleton block h-2.5 w-3/5 rounded-full" />
                  </motion.div>
                ) : (
                  <motion.p
                    key="caption"
                    className="text-[12px] leading-snug text-stone-600"
                    initial={{ opacity: 0, filter: "blur(4px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    It&apos;s back for autumn. Flaky, buttery and spiced just right. Pre-order for Saturday 🧡
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <Actions phase={phase} />
          </div>
        </div>
      </div>
      <Stepper step={STEP_FOR[phase]} />
    </div>
  );
}

/** Desktop brand panel on the sign-in screens. */
export function AuthShowcase() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-7, 7]), { stiffness: 110, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), { stiffness: 110, damping: 18 });

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    if (reduce) return;
    px.set(x / r.width - 0.5);
    py.set(y / r.height - 0.5);
  }
  function onPointerLeave() {
    px.set(0);
    py.set(0);
  }

  return (
    <section
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="fold-show group/panel relative hidden min-h-dvh flex-col items-center justify-center overflow-hidden px-10 py-12 text-white lg:flex xl:px-14"
    >
      <Backdrop />
      <div aria-hidden className="spotlight-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover/panel:opacity-100" />
      <div aria-hidden className="spotlight-dots pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover/panel:opacity-100" />

      <div className="relative flex w-full max-w-[540px] flex-col items-center text-center">
        <div className="animate-rise">
          <Wordmark tone="light" className="h-14 xl:h-16" />
        </div>

        <h2 className="mt-9 text-[2.5rem] leading-[1.06] font-bold tracking-tight text-[#f6f3ee] xl:text-[3.1rem]">
          <Tagline />
        </h2>
        <p className="animate-rise mt-4 max-w-md text-[15px] leading-relaxed text-white/60" style={{ animationDelay: "0.45s" }}>
          One shared place where agencies plan and create social media, and clients review and approve it before anything is posted.
        </p>

        <motion.div className="mt-10 flex w-full justify-center text-left" style={{ rotateX, rotateY, transformPerspective: 1200 }}>
          <div className="page-enter w-full max-w-[440px]">
            <div style={{ animationDelay: "0.6s" }}>
              <ApprovalStory />
            </div>
          </div>
        </motion.div>

        <div className="mt-10 grid w-full max-w-[460px] grid-cols-2 border-t border-white/10 [@media(max-height:860px)]:hidden">
          {[
            { icon: Building2, title: "For agencies", text: "Plan every client's month, track the work and get sign-off." },
            { icon: Smartphone, title: "For clients", text: "Preview posts as they'll look and approve them in a tap." },
          ].map((a, i) => (
            <div
              key={a.title}
              className={cn("animate-rise flex flex-col items-center px-5 pt-5", i === 1 && "border-l border-white/10")}
              style={{ animationDelay: `${0.8 + i * 0.1}s` }}
            >
              <span className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
                <a.icon className="size-4 text-white/85" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-white/95">{a.title}</p>
              <p className="mt-1 text-[13px] leading-snug text-white/55">{a.text}</p>
            </div>
          ))}
        </div>
        <p className="animate-rise mt-6 flex items-center justify-center gap-2 text-xs text-white/45" style={{ animationDelay: "1s" }}>
          <ShieldCheck className="size-4" aria-hidden /> Secure sign-in. Every client&apos;s workspace is private.
        </p>
      </div>
    </section>
  );
}

/** Compact decorative header for phones and tablets. */
export function AuthMobileHero() {
  return (
    <div className="fold-hide relative overflow-hidden px-6 pt-10 pb-24 text-white lg:hidden">
      <Backdrop compact />
      <Mark3D className="absolute top-1 -right-2 size-[124px] sm:right-4 sm:size-[150px]" />
      <div className="animate-rise relative">
        <Wordmark tone="light" className="h-10" />
      </div>
      <p className="relative mt-6 max-w-xs font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-[#f6f3ee]">
        <Tagline delay={0.15} />
      </p>
      <span
        aria-hidden
        className="animate-pop-in absolute right-5 bottom-20 hidden items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-lg shadow-black/30 sm:inline-flex"
        style={{ animationDelay: "0.7s" }}
      >
        <CheckCircle2 className="size-3.5" /> Approved
      </span>
    </div>
  );
}
