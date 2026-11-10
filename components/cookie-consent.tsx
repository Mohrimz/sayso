"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ChevronDown, Cookie } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { CONSENT_COOKIE, CONSENT_MAX_AGE, consentAcceptedAt, consentValue, STORED_ITEMS } from "@/lib/consent";
import { cn } from "@/lib/utils";

const EVENT = "sayso:consent";

function readConsent(): "accepted" | "needed" {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  return consentAcceptedAt(raw ? decodeURIComponent(raw) : null) ? "accepted" : "needed";
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("focus", callback);
  };
}

function accept() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${consentValue()}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Cookie notice in the bottom-right corner (along the bottom on phones). It
 * doesn't block the page, but signing in is refused on the server until it's
 * accepted, so everyone accepts before they sign in.
 */
export function CookieConsent() {
  const state = useSyncExternalStore(subscribe, readConsent, () => "unknown" as const);
  const [details, setDetails] = useState(false);
  if (state !== "needed") return null;
  // Only ever rendered in the browser (the server snapshot is "unknown"), so reading the
  // address directly is safe and avoids usePathname, which would block prerendering here.
  // Signed-in pages have a bottom tab bar on phones and tablets (56px): sit above it there.
  const publicPage = ["/login", "/setup", "/privacy", "/auth"].some((p) => window.location.pathname.startsWith(p));

  return (
    <section
      aria-label="Cookie consent"
      className={cn(
        "animate-rise fixed inset-x-3 z-[60] rounded-2xl border border-line bg-surface/95 px-3.5 py-3 shadow-2xl shadow-black/15 backdrop-blur-md sm:inset-x-auto sm:right-4 sm:w-[350px] lg:bottom-4",
        publicPage
          ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-4"
          : "bottom-[calc(64px+env(safe-area-inset-bottom))]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Cookie className="size-[18px]" aria-hidden />
        </span>
        <p className="min-w-0 text-[13px] leading-snug text-ink-soft">
          <span className="font-semibold text-ink">Cookies:</span> we only use essential ones, to keep you signed in. No tracking.
        </p>
      </div>

      {details ? (
        <ul className="mt-2.5 ml-[42px] space-y-2 border-l-2 border-line pl-3">
          {STORED_ITEMS.map((item) => (
            <li key={item.name} className="text-xs leading-snug">
              <span className="font-medium text-ink">{item.name}</span>
              <span className="text-muted"> · {item.lasts}</span>
              <span className="block text-ink-soft">{item.purpose}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 ml-[42px] flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted hover:text-ink"
        >
          {details ? "Hide details" : "What we store"}
          <ChevronDown className={cn("size-3.5 transition", details && "rotate-180")} aria-hidden />
        </button>
        <Link href="/privacy#cookies" className="text-xs font-medium text-accent-ink underline-offset-2 hover:underline">
          Privacy
        </Link>
        <button type="button" onClick={accept} className={buttonClass("primary", "sm", "ml-auto")}>
          Accept
        </button>
      </div>
    </section>
  );
}
