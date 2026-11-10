import { ViewTransition, type ReactNode } from "react";
import { Card, Skeleton } from "@/components/ui";
import { SlowHint } from "@/components/slow-hint";

/** Page-shaped loading placeholders, so the layout doesn't jump when content arrives. */

/** When the real page arrives, the placeholder blurs away while the content comes into focus. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="vt-out" default="none">
      <div className="space-y-6" role="status" aria-busy="true">
        <span className="sr-only">Loading…</span>
        {children}
        <SlowHint />
      </div>
    </ViewTransition>
  );
}

function Heading({ wide = false }: { wide?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className={wide ? "h-8 w-72" : "h-8 w-52"} />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

function Rows({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Frame>
      <Heading wide />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          // Same shape as the real stat cards: icon above the number on phones, beside it from sm up.
          <Card key={i} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-10 max-w-full" />
              <Skeleton className="h-3 w-16 max-w-full" />
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-4 w-44" />
        </div>
        <Rows count={4} />
      </Card>
      <Card>
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-4 w-24" />
        </div>
        <Rows count={3} />
      </Card>
    </Frame>
  );
}

export function WorkspaceHomeSkeleton() {
  return (
    <Frame>
      <Heading />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex gap-3 p-3">
            <Skeleton className="aspect-[4/5] w-20 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="mt-4 h-5 w-28 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="space-y-4 p-5 xl:col-span-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-3 rounded-full" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <div className="border-b border-line px-5 py-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <Rows count={2} />
        </Card>
      </div>
    </Frame>
  );
}

export function PlanSkeleton() {
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="flex gap-5 border-b border-line pb-3">
        {[64, 72, 56, 64].map((w, i) => (
          <Skeleton key={i} className="h-4" style={{ width: w }} />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border border-line md:block">
        <div className="grid grid-cols-7 gap-px bg-line">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="min-h-24 space-y-1.5 bg-surface p-2">
              <Skeleton className="size-5 rounded-full" />
              {i % 3 === 0 ? <Skeleton className="h-5 rounded-md" /> : null}
            </div>
          ))}
        </div>
      </div>
      <Card className="md:hidden">
        <Rows count={5} />
      </Card>
    </Frame>
  );
}

export function ContentSkeleton() {
  return (
    <Frame>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[340px] rounded-[2.2rem] border-[7px] border-line bg-surface">
          <div className="flex items-center gap-2 p-3">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="aspect-[4/5] rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Skeleton className="h-2 rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-44 rounded-lg" />
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
          </Card>
          <div className="flex gap-5 border-b border-line pb-3">
            {[80, 56, 56].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: w }} />
            ))}
          </div>
          <Rows count={2} />
        </div>
      </div>
    </Frame>
  );
}

export function ListSkeleton() {
  return (
    <Frame>
      <Heading />
      <Card>
        <Rows count={6} />
      </Card>
    </Frame>
  );
}
