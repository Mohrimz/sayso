"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ChartNoAxesColumnIncreasing, ExternalLink, Link2, RefreshCw, TriangleAlert } from "lucide-react";
import { refreshPostResults } from "@/app/actions/post-results";
import { AnimatedNumber } from "@/components/anim";
import { Card, CardHeader } from "@/components/ui";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type PlatformView =
  | { state: "ok"; metrics: Record<string, number>; permalink: string | null; fetchedAt: string; warning?: string }
  | { state: "not_found"; fetchedAt?: string }
  | { state: "error"; error: string; fetchedAt?: string }
  | { state: "pending" | "no_link" | "not_linked" | "not_configured" | "not_published" | "not_used" };

export type ResultsViews = { instagram: PlatformView; facebook: PlatformView };

const PLATFORMS = [
  {
    key: "instagram",
    label: "Instagram",
    tiles: [
      { key: "views", label: "Views" },
      { key: "reach", label: "Reach" },
      { key: "likes", label: "Likes" },
      { key: "comments", label: "Comments" },
      { key: "shares", label: "Shares" },
      { key: "saved", label: "Saves" },
    ],
  },
  {
    key: "facebook",
    label: "Facebook",
    tiles: [
      { key: "reactions", label: "Reactions" },
      { key: "comments", label: "Comments" },
      { key: "shares", label: "Shares" },
    ],
  },
] as const;

const SETUP_STATES = ["no_link", "not_linked", "not_configured"] as const;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function setupMessage(platform: "instagram" | "facebook", view: PlatformView) {
  const name = platform === "instagram" ? "Instagram account" : "Facebook Page";
  if (view.state === "not_linked") return `Link this client's ${name} to show ${platform === "instagram" ? "Instagram" : "Facebook"} results.`;
  if (view.state === "no_link") return "Add the live Instagram post link (under Details) to show Instagram results.";
  if (view.state === "not_configured") return "Results aren't switched on for this site yet (the Make API token is missing).";
  return null;
}

/**
 * How a published post is doing on Instagram and Facebook. Shows saved
 * numbers straight away and fetches fresh ones in the background when
 * they're out of date.
 */
export function PostResultsCard({
  itemId,
  initial,
  stale,
  isAgency,
  settingsHref,
}: {
  itemId: string;
  initial: ResultsViews;
  stale: boolean;
  isAgency: boolean;
  settingsHref: string;
}) {
  const [views, setViews] = useState(initial);
  const [pending, startTransition] = useTransition();

  function load(force: boolean) {
    startTransition(async () => {
      try {
        setViews(await refreshPostResults(itemId, force));
      } catch {
        setViews((current) => ({
          instagram: current.instagram.state === "ok" ? { ...current.instagram, warning: "Couldn't refresh just now." } : current.instagram,
          facebook: current.facebook.state === "ok" ? { ...current.facebook, warning: "Couldn't refresh just now." } : current.facebook,
        }));
      }
    });
  }

  useEffect(() => {
    if (stale) load(false);
    // Only when this post is first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clients only see platforms that have (or are getting) numbers; the agency also sees what's missing.
  const shown = PLATFORMS.filter((p) => {
    const state = views[p.key].state;
    if (state === "ok" || state === "pending") return true;
    return isAgency && (state === "not_found" || state === "error");
  });
  const gaps = isAgency
    ? PLATFORMS.map((p) => ({ platform: p.key, message: setupMessage(p.key, views[p.key]) })).filter(
        (g): g is { platform: "instagram" | "facebook"; message: string } =>
          g.message !== null && (SETUP_STATES as readonly string[]).includes(views[g.platform].state),
      )
    : [];

  if (!shown.length && !gaps.length) return null;

  const fetched = PLATFORMS.map((p) => views[p.key])
    .map((v) => ("fetchedAt" in v ? v.fetchedAt : undefined))
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <Card aria-busy={pending}>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ChartNoAxesColumnIncreasing className="size-4 text-accent" aria-hidden /> Results
          </span>
        }
        description={pending ? "Getting the latest numbers…" : fetched ? `Updated ${timeAgo(fetched)}` : shown.length ? "Getting the first numbers…" : undefined}
        action={
          shown.length ? (
            <button
              type="button"
              onClick={() => load(true)}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-soft hover:bg-sunken hover:text-ink disabled:opacity-60"
            >
              <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden /> Refresh
            </button>
          ) : null
        }
      />

      {shown.map((platform, index) => {
        const view = views[platform.key];
        const loading = view.state === "pending";
        return (
          <section key={platform.key} aria-label={`${platform.label} results`} className={cn(index > 0 && "border-t border-line")}>
            <div className="flex items-center justify-between gap-2 px-4 pt-3 sm:px-5">
              <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{platform.label}</h3>
              {view.state === "ok" && view.permalink ? (
                <a href={view.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
                  View post <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </div>
            {view.state === "ok" || loading ? (
              <dl className={cn("grid gap-x-4 gap-y-3 px-4 pt-2 pb-4 sm:px-5", platform.tiles.length > 3 ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3")}>
                {platform.tiles.map((tile) => {
                  const value = view.state === "ok" ? view.metrics[tile.key] : undefined;
                  return (
                    <div key={tile.key} className="min-w-0">
                      <dt className="truncate text-xs text-muted">{tile.label}</dt>
                      <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">
                        {loading ? (
                          <span className="inline-block h-6 w-10 animate-pulse rounded bg-sunken align-middle" />
                        ) : value === undefined ? (
                          <span className="text-faint">–</span>
                        ) : value >= 10_000 ? (
                          compact.format(value)
                        ) : (
                          <AnimatedNumber value={value} />
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="flex items-start gap-2 px-4 pt-2 pb-4 text-sm text-ink-soft sm:px-5">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                {view.state === "not_found"
                  ? platform.key === "instagram"
                    ? "This post isn't among the account's latest 50 Instagram posts. Check the live post link."
                    : "No Facebook Page post was found around the time this went out on Instagram."
                  : view.state === "error"
                    ? view.error
                    : "Results couldn't be loaded."}
              </p>
            )}
            {view.state === "ok" && view.warning ? (
              <p className="px-4 pb-3 text-xs text-amber-700 sm:px-5">{view.warning} Showing the last saved numbers.</p>
            ) : null}
          </section>
        );
      })}

      {gaps.length ? (
        <div className={cn("space-y-1.5 px-4 py-3 sm:px-5", shown.length && "border-t border-line")}>
          {gaps.map((gap) => (
            <p key={gap.platform} className="flex items-start gap-2 text-[13px] text-muted">
              <Link2 className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              <span>
                {gap.message}{" "}
                {views[gap.platform].state === "not_linked" ? (
                  <Link href={settingsHref} className="font-medium text-accent-ink hover:underline">
                    Link it in Settings
                  </Link>
                ) : null}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
