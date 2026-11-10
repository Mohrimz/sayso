import { Suspense } from "react";
import { AppChrome, ChromeSkeleton } from "@/components/shell/app-chrome";
import { SaysoDock } from "@/components/assistant/sayso-dock";
import { LastSeen } from "@/components/last-seen";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<ChromeSkeleton />}>
        <AppChrome />
      </Suspense>
      <div className="lg:pl-[264px]">
        <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16">{children}</main>
      </div>
      {/* Keeps "last seen" up to date for the Team page and profiles. */}
      <LastSeen />
      {/* Sayso, the team assistant: a corner button for agency staff. */}
      <Suspense fallback={null}>
        <SaysoDock />
      </Suspense>
      {/* A client's first sign-in setup, over everything until it's done. */}
      <Suspense fallback={null}>
        <OnboardingGate />
      </Suspense>
    </div>
  );
}
