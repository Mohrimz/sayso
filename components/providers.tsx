"use client";

import { Suspense, type ReactNode } from "react";
import { NavProgress } from "@/components/nav-progress";
import { CookieConsent } from "@/components/cookie-consent";
import { TiltLayer } from "@/components/tilt-layer";
import { ArrivalProvider } from "@/components/arrival/arrival";
import { MotionConfig } from "motion/react";
import { Tooltip } from "radix-ui";
import { Toaster } from "sonner";

/** App-wide providers: animation settings, tooltips and toasts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={350} skipDelayDuration={200}>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {/* The welcome animation after sign-in sits above every page. */}
        <ArrivalProvider>{children}</ArrivalProvider>
        <CookieConsent />
        <TiltLayer />
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ classNames: { toast: "!rounded-xl !font-sans !text-sm" } }}
        />
      </Tooltip.Provider>
    </MotionConfig>
  );
}
