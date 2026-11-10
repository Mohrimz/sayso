"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { MARK_EMBER } from "@/lib/brand-mark";
import { WORDMARK_EMBER, WORDMARK_INK, WORDMARK_VIEWBOX } from "@/lib/brand-wordmark";
import { APP_NAME } from "@/lib/env";
import type { ArrivalKind } from "@/lib/arrival";

/**
 * The welcome animation after signing in, and the goodbye when signing out.
 * /arrive starts the welcome; the sign-out buttons start the goodbye. The
 * overlay lives here, above every page, so it stays on screen while the next
 * page loads underneath and then gets out of the way to reveal it.
 */

type Arrival = { id: number; name: string; kind: ArrivalKind; to: string; from: string };
type Departure = { id: number; name: string; from: string };
type Start = (arrival: Omit<Arrival, "id" | "from">) => void;
type Leave = (departure: { name: string }) => void;

const ArrivalContext = createContext<{ start: Start; leave: Leave }>({ start: () => {}, leave: () => {} });

/** Same background as /arrive, so the hand-over is seamless. */
export const ARRIVAL_BACKGROUND = "#0d0c11";

// How long the logo and greeting play before the destination page opens.
const INTRO_MS = { back: 1050, new: 1700 } as const;
const REVEAL_MS = 520;
// The ember seal's centre in the wordmark's coordinates.
const SEAL = { x: 1491, y: 758 };
const INK_COLOR = "#f6f1e7";

export function ArrivalProvider({ children }: { children: ReactNode }) {
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [departure, setDeparture] = useState<Departure | null>(null);

  // Wraps every page, so it reads nothing from the router itself (that could hold up the first render).
  const start = useCallback<Start>((next) => {
    const from = window.location.pathname;
    setDeparture(null);
    setArrival((current) =>
      // React runs effects twice in development; don't restart a welcome that's already playing.
      current && current.to === next.to && current.kind === next.kind ? current : { ...next, id: Date.now(), from },
    );
  }, []);

  const leave = useCallback<Leave>(({ name }) => {
    const from = window.location.pathname;
    setArrival(null);
    setDeparture((current) => current ?? { name, id: Date.now(), from });
  }, []);

  const value = useMemo(() => ({ start, leave }), [start, leave]);

  return (
    <ArrivalContext.Provider value={value}>
      {children}
      {arrival ? <ArrivalOverlay key={arrival.id} arrival={arrival} onDone={() => setArrival(null)} /> : null}
      {departure ? <DepartureOverlay key={departure.id} departure={departure} onDone={() => setDeparture(null)} /> : null}
    </ArrivalContext.Provider>
  );
}

/**
 * Signs out with the goodbye animation: covers the page, runs the sign-out
 * server action (which redirects to /login), then fades away on the login page.
 */
export function useSignOut() {
  const { leave } = useContext(ArrivalContext);
  const [, startTransition] = useTransition();
  return useCallback(
    (name: string, action: () => Promise<void>) => {
      leave({ name });
      startTransition(async () => {
        await action();
      });
    },
    [leave],
  );
}

/** A form for a sign-out server action that shows the goodbye while it runs. */
export function SignOutForm({ name, ...props }: ComponentProps<"form"> & { name: string }) {
  const { leave } = useContext(ArrivalContext);
  return (
    <form
      {...props}
      onSubmit={(e) => {
        props.onSubmit?.(e);
        if (!e.defaultPrevented) leave({ name });
      }}
    />
  );
}

/** Rendered by /arrive: starts the welcome before the first paint. */
export function ArrivalStart({ name, kind, to }: { name: string; kind: ArrivalKind; to: string }) {
  const { start } = useContext(ArrivalContext);
  useLayoutEffect(() => {
    start({ name, kind, to });
  }, [start, name, kind, to]);
  return null;
}

function ArrivalOverlay({ arrival, onDone }: { arrival: Arrival; onDone: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<"intro" | "waiting" | "reveal">("intro");
  const navigating = useRef(false);
  const leftStartPage = pathname !== arrival.from;
  const isNew = arrival.kind === "new";
  const firstName = arrival.name.trim() || "there";

  // Opens the destination: when the intro ends, or straight away on a tap.
  const go = useCallback(() => {
    if (navigating.current) return;
    navigating.current = true;
    setPhase("waiting");
    router.replace(arrival.to);
  }, [router, arrival.to]);

  // Load the destination while the logo plays, then open it.
  useEffect(() => {
    router.prefetch(arrival.to);
    const timer = window.setTimeout(go, reduce ? 400 : INTRO_MS[arrival.kind]);
    return () => window.clearTimeout(timer);
  }, [router, arrival.to, arrival.kind, reduce, go]);

  // Reveal once the new page is in place (with a cap, in case it redirects elsewhere).
  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = window.setTimeout(() => setPhase("reveal"), leftStartPage ? 120 : 8000);
    return () => window.clearTimeout(timer);
  }, [phase, leftStartPage]);

  // Tap, click or press a key to skip ahead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", "Enter", " "].includes(e.key)) go();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // No scrolling the page behind the welcome.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  const finish = () => {
    onDone();
    if (isNew && !reduce) void import("@/components/anim").then(({ celebrate }) => celebrate());
  };

  return (
    <motion.div
      role="status"
      aria-live="polite"
      onClick={go}
      initial={false}
      animate={
        phase === "reveal"
          ? reduce
            ? { opacity: 0 }
            : { clipPath: "circle(0% at 50% 46%)", opacity: 1 }
          : { clipPath: "circle(150% at 50% 46%)", opacity: 1 }
      }
      transition={{ duration: reduce ? 0.2 : REVEAL_MS / 1000, ease: [0.65, 0, 0.25, 1] }}
      onAnimationComplete={() => {
        if (phase === "reveal") finish();
      }}
      className="fixed inset-0 z-[70] flex cursor-pointer flex-col items-center justify-center overflow-hidden px-6 text-center select-none"
      style={{ backgroundColor: ARRIVAL_BACKGROUND }}
    >
      <Backdrop />

      <motion.div
        className="relative flex flex-col items-center"
        animate={phase === "reveal" && !reduce ? { scale: 0.86, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: REVEAL_MS / 1000, ease: [0.65, 0, 0.25, 1] }}
      >
        <WordmarkDrawIn reduce={reduce} slow={isNew} />

        <h1 className="mt-7 font-display text-[1.65rem] leading-tight font-bold tracking-tight text-[#f6f3ee] sm:text-[2.1rem]">
          <Words
            text={isNew ? `Welcome to ${APP_NAME},` : "Welcome back,"}
            delay={reduce ? 0 : isNew ? 0.75 : 0.45}
            reduce={reduce}
          />{" "}
          <motion.span
            className="inline-block text-[#ff6a3d]"
            initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: isNew ? 1.0 : 0.62, type: "spring", stiffness: 260, damping: 22 }}
          >
            {firstName}
          </motion.span>
        </h1>

        <motion.p
          className="mt-2 text-sm text-white/60 sm:text-[15px]"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: isNew ? 1.2 : 0.75, duration: 0.4 }}
        >
          {isNew ? "Let's get you set up." : "Opening your workspace…"}
        </motion.p>

        <div className="mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-linear-to-r from-[#ff5b2e] to-[#f59e0b]"
            initial={{ width: "8%" }}
            animate={{ width: phase === "intro" ? "70%" : "100%" }}
            transition={{ duration: phase === "intro" ? INTRO_MS[arrival.kind] / 1000 : 0.35, ease: "easeOut" }}
          />
        </div>
      </motion.div>

      <motion.span
        className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-[11px] tracking-wide text-white/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "intro" ? 1 : 0 }}
        transition={{ delay: phase === "intro" ? 0.6 : 0, duration: 0.3 }}
        aria-hidden
      >
        Tap to skip
      </motion.span>
    </motion.div>
  );
}

// How long the goodbye shows at least, while signing out finishes.
const GOODBYE_MIN_MS = 1250;

/**
 * The goodbye after signing out: the ember screen closes in over the app, the
 * seal waves, then it fades away on the login page. Signing out itself has
 * already started, so this only covers the wait.
 */
function DepartureOverlay({ departure, onDone }: { departure: Departure; onDone: () => void }) {
  const pathname = usePathname();
  const reduce = useReducedMotion() ?? false;
  const [minShown, setMinShown] = useState(false);
  const [phase, setPhase] = useState<"cover" | "reveal">("cover");
  const box = useRef<HTMLDivElement>(null);
  const signedOut = pathname !== departure.from;
  const firstName = departure.name.trim().split(" ")[0] || "there";

  useEffect(() => {
    // Take focus, so it isn't left inside a menu that's closing.
    box.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setMinShown(true), reduce ? 500 : GOODBYE_MIN_MS);
    // Safety net: if signing out never finishes (say, the connection dropped),
    // get out of the way and say so, rather than leave the screen covered.
    const fallback = window.setTimeout(() => {
      setPhase("reveal");
      toast.error("Signing out didn't finish. Check your connection and try again.");
    }, 8000);
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      root.style.overflow = previous;
    };
  }, [reduce]);

  useEffect(() => {
    if (!minShown || !signedOut) return;
    const timer = window.setTimeout(() => setPhase("reveal"), 80);
    return () => window.clearTimeout(timer);
  }, [minShown, signedOut]);

  return (
    <motion.div
      ref={box}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { clipPath: "circle(0% at 50% 50%)", opacity: 1 }}
      animate={
        phase === "reveal" ? { opacity: 0 } : reduce ? { opacity: 1 } : { clipPath: "circle(150% at 50% 50%)", opacity: 1 }
      }
      transition={phase === "reveal" ? { duration: 0.45, ease: "easeOut" } : { duration: reduce ? 0.2 : 0.6, ease: [0.65, 0, 0.25, 1] }}
      onAnimationComplete={() => {
        if (phase === "reveal") onDone();
      }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden px-6 text-center outline-none select-none"
      style={{ backgroundColor: ARRIVAL_BACKGROUND }}
    >
      <Backdrop />
      <motion.div
        className="relative flex flex-col items-center"
        animate={phase === "reveal" && !reduce ? { scale: 0.96, y: -6 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <WordmarkWave reduce={reduce} />
        <h1 className="mt-7 font-display text-[1.65rem] leading-tight font-bold tracking-tight text-[#f6f3ee] sm:text-[2.1rem]">
          <Words text="See you soon," delay={reduce ? 0 : 0.3} reduce={reduce} />{" "}
          <motion.span
            className="inline-block text-[#ff6a3d]"
            initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.48, type: "spring", stiffness: 260, damping: 22 }}
          >
            {firstName}
          </motion.span>
        </h1>
        {/* Not shown on screen (the user asked for no "signed out" message), but still announced to screen readers. */}
        <p className="sr-only">You&apos;re signed out.</p>
      </motion.div>
    </motion.div>
  );
}

// The wordmark's ink path ends with the tick that sits on the ember seal. Split
// it off so the seal and its tick can wave goodbye together.
const TICK_START = WORDMARK_INK.lastIndexOf("M1559.6,681.5");
const LETTERS = TICK_START > 0 ? WORDMARK_INK.slice(0, TICK_START) : WORDMARK_INK;
const TICK = TICK_START > 0 ? WORDMARK_INK.slice(TICK_START) : "";

/** The wordmark, already drawn, with the seal giving a little wave. */
function WordmarkWave({ reduce }: { reduce: boolean }) {
  return (
    <motion.svg
      viewBox={WORDMARK_VIEWBOX}
      role="img"
      aria-label={APP_NAME}
      className="h-14 w-auto overflow-visible sm:h-[4.5rem]"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
    >
      <path d={LETTERS} fill={INK_COLOR} />
      {/* Motion turns SVG groups around their own centre, which is the seal's centre. */}
      <motion.g
        animate={reduce || !TICK ? undefined : { rotate: [0, -18, 14, -9, 4, 0] }}
        transition={{ delay: 0.55, duration: 1.0, ease: "easeInOut" }}
      >
        <path d={WORDMARK_EMBER} fill={MARK_EMBER} />
        {TICK ? <path d={TICK} fill={INK_COLOR} /> : null}
      </motion.g>
    </motion.svg>
  );
}

/** The "sayso" wordmark: letters traced in, then filled, while the ember seal pops in under the tick. */
function WordmarkDrawIn({ reduce, slow }: { reduce: boolean; slow: boolean }) {
  const pace = slow ? 1.35 : 1;
  return (
    <svg viewBox={WORDMARK_VIEWBOX} role="img" aria-label={APP_NAME} className="h-14 w-auto overflow-visible sm:h-[4.5rem]">
      {/* A soft ring that ripples out from the seal as it lands. */}
      {!reduce ? (
        <motion.circle
          cx={SEAL.x}
          cy={SEAL.y}
          fill="none"
          stroke={MARK_EMBER}
          strokeWidth={10}
          initial={{ r: 110, opacity: 0 }}
          animate={{ r: 300, opacity: [0, 0.55, 0] }}
          transition={{ delay: 0.5 * pace, duration: 0.8, ease: "easeOut" }}
        />
      ) : null}
      <motion.path
        d={WORDMARK_EMBER}
        fill={MARK_EMBER}
        initial={reduce ? false : { scale: 0, rotate: -50, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        // Motion scales SVG shapes around their own centre, which is the seal's centre.
        transition={{ delay: 0.42 * pace, type: "spring", stiffness: 420, damping: 15 }}
      />
      <motion.path
        d={WORDMARK_INK}
        stroke={INK_COLOR}
        strokeWidth={5}
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, fill: "rgba(246, 241, 231, 0)" }}
        animate={{ pathLength: 1, fill: INK_COLOR }}
        transition={{
          pathLength: { duration: 0.62 * pace, ease: [0.6, 0, 0.2, 1] },
          fill: { delay: 0.42 * pace, duration: 0.3 },
        }}
      />
    </svg>
  );
}

/** Words that rise into place one after another (real spaces between them, so it reads correctly). */
function Words({ text, delay, reduce }: { text: string; delay: number; reduce: boolean }) {
  return text.split(" ").map((word, i) => (
    <Fragment key={i}>
      {i > 0 ? " " : null}
      <motion.span
        className="inline-block"
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + i * 0.06, type: "spring", stiffness: 300, damping: 24 }}
      >
        {word}
      </motion.span>
    </Fragment>
  ));
}

/** The login screen's ember light, drifting slowly behind the logo. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="animate-drift-a absolute -top-32 -left-28 size-[26rem] rounded-full bg-[#d9381a]/35 blur-[90px]" />
      <div className="animate-drift-b absolute -right-32 -bottom-40 size-[24rem] rounded-full bg-[#f59e0b]/20 blur-[90px]" />
      <motion.div
        className="absolute top-1/2 left-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff5b2e]/10 blur-[100px]"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
      <div className="absolute inset-0 [background-image:radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_50%_45%,black_15%,transparent_65%)]" />
      <div className="grain absolute inset-0 opacity-[0.06] mix-blend-overlay" />
    </div>
  );
}

export function useArrival() {
  return useContext(ArrivalContext);
}
