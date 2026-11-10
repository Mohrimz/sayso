import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { AuthMobileHero, AuthShowcase } from "@/components/auth-showcase";
import { Mark3D } from "@/components/mark-3d";
import { FadeIn } from "@/components/anim";
import { KeepFocusedFieldVisible } from "@/components/keep-focused-field-visible";

/**
 * Layout for the sign-in and setup screens: an animated brand panel on
 * desktop, a decorative header on phones, and the form in a card.
 */
export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <main
      data-keep-focus-visible
      // While the phone keyboard is open, extra room at the bottom lets the last field scroll up into view.
      style={{ paddingBottom: "var(--keyboard-inset, 0px)" }}
      className="fold-auth min-h-dvh bg-canvas lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <KeepFocusedFieldVisible />
      <AuthShowcase />

      <section className="relative flex min-h-dvh flex-col lg:min-h-0">
        <AuthMobileHero />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/4 right-0 hidden size-72 rounded-full bg-accent/10 blur-3xl lg:block"
        />
        <div className="fold-center relative flex flex-1 justify-center px-4 pb-10 sm:px-6 lg:items-center lg:px-10 lg:py-12">
          <FadeIn className="relative -mt-16 w-full max-w-[430px] lg:mt-0">
            <Mark3D tone="ink" className="mx-auto -mb-3 hidden size-[176px] lg:block" />
            <div className="rounded-3xl border border-line bg-surface p-6 shadow-xl shadow-black/[0.05] sm:p-8">
              <h1 className="text-[1.7rem] leading-tight font-bold tracking-tight text-ink">{title}</h1>
              {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p> : null}
              <div className="mt-6">{children}</div>
            </div>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
              <Lock className="size-3.5" aria-hidden /> Secure sign-in · Your workspace is private to your team
            </p>
            <p className="mt-2 text-center text-xs text-muted">
              <Link href="/privacy" className="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink">
                Privacy Policy
              </Link>
            </p>
          </FadeIn>
        </div>
      </section>
    </main>
  );
}
