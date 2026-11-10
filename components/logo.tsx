import { APP_NAME } from "@/lib/env";
import { MARK_EMBER, MARK_FOLDS, MARK_INK, MARK_VIEWBOX } from "@/lib/brand-mark";
import { WORDMARK_EMBER, WORDMARK_INK, WORDMARK_VIEWBOX } from "@/lib/brand-wordmark";
import { cn } from "@/lib/utils";

type Tone = "ink" | "light";
const toneClass = (tone: Tone) => (tone === "light" ? "text-[#f6f1e7]" : "text-[#141218]");

/** The folded-ribbon S symbol: the favicon and the 3D mark. */
export function LogoMark({ className, tone = "ink" }: { className?: string; tone?: Tone }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={cn("shrink-0", toneClass(tone), className)} aria-hidden>
      {MARK_INK.map((d, i) => (
        <path key={`i${i}`} d={d} fill="currentColor" />
      ))}
      {MARK_FOLDS.map((d, i) => (
        <path key={`f${i}`} d={d} fill={MARK_EMBER} />
      ))}
    </svg>
  );
}

/** The "sayso" wordmark, its final o an ember seal holding a tick. Size it by height. */
export function Wordmark({ className, tone = "ink" }: { className?: string; tone?: Tone }) {
  return (
    <svg viewBox={WORDMARK_VIEWBOX} role="img" aria-label={APP_NAME} className={cn("w-auto shrink-0", toneClass(tone), className)}>
      <path d={WORDMARK_EMBER} fill={MARK_EMBER} />
      <path d={WORDMARK_INK} fill="currentColor" />
    </svg>
  );
}

export function Logo({ className, size = "md", tone = "ink" }: { className?: string; size?: "md" | "lg"; tone?: Tone }) {
  return <Wordmark tone={tone} className={cn(size === "lg" ? "h-10" : "h-8", className)} />;
}
