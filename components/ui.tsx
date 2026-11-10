import Link from "next/link";
import { ViewTransition, type ComponentProps, type ReactNode } from "react";
import { cn, initials } from "@/lib/utils";
import type { Tone } from "@/lib/content";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary text-white",
  secondary: "btn-secondary bg-surface text-ink border border-line-strong hover:bg-sunken shadow-[0_1px_0_rgba(0,0,0,0.03)]",
  ghost: "text-ink-soft hover:bg-sunken",
  danger: "bg-surface text-danger border border-danger/30 hover:bg-danger-soft",
  success: "bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm shadow-emerald-900/20",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "btn inline-flex select-none items-center justify-center rounded-lg font-semibold whitespace-nowrap disabled:pointer-events-none disabled:opacity-50",
    variantClass[variant],
    sizeClass[size],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const toneClass: Record<Tone, string> = {
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
  purple: "bg-violet-50 text-violet-800 ring-violet-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  green: "bg-green-50 text-green-800 ring-green-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  emerald: "bg-emerald-700 text-white ring-emerald-700",
};

export const toneDot: Record<Tone, string> = {
  gray: "bg-stone-400",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  purple: "bg-violet-500",
  blue: "bg-blue-600",
  green: "bg-green-600",
  teal: "bg-teal-600",
  emerald: "bg-emerald-700",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const avatarSize = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-12 text-base",
  xl: "size-24 text-3xl",
} as const;

/** A person's profile picture, or their initials on a colour when they haven't added one. */
export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof avatarSize;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small public storage images, already sized
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={cn("inline-block shrink-0 rounded-full bg-sunken object-cover", avatarSize[size], className)}
      />
    );
  }
  const palette = ["bg-amber-200 text-amber-900", "bg-sky-200 text-sky-900", "bg-emerald-200 text-emerald-900", "bg-rose-200 text-rose-900", "bg-violet-200 text-violet-900", "bg-lime-200 text-lime-900"];
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        avatarSize[size],
        palette[hash % palette.length],
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center sm:px-6">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[13px] font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/** Placeholder block with a soft shimmer, shown while content loads. */
export function Skeleton({ className, style }: { className?: string; style?: ComponentProps<"div">["style"] }) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} style={style} />;
}

export function PageSkeleton() {
  return (
    <ViewTransition exit="vt-out" default="none">
      <div className="space-y-6" role="status" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </ViewTransition>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
