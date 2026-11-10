import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { Skeleton } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { hasAgencyAdmin } from "@/lib/setup";
import { safeNext } from "@/lib/utils";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see your plans, review posts and keep approvals moving.">
      <Suspense
        fallback={
          <div className="space-y-4" role="status" aria-busy="true">
            <span className="sr-only">Loading…</span>
            <Skeleton className="h-11 rounded-xl" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        }
      >
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await getViewer()) redirect(next);

  const needsSetup = !(await hasAgencyAdmin());
  return (
    <>
      {params.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          That sign-in link has expired or was already used. Request a new one below.
        </p>
      ) : null}
      {params.deleted ? (
        <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-800">
          Your account has been deleted. Thanks for working with us.
        </p>
      ) : null}
      {params.signedout === "all" ? (
        <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-800">
          You&apos;ve been signed out on every device. Sign in again below.
        </p>
      ) : null}
      <LoginForm next={next} />
      {needsSetup ? (
        <Link
          href="/setup"
          className="group mt-4 flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent-soft/60 px-4 py-3 text-[13px] text-ink-soft transition hover:border-accent/50"
        >
          <span>
            <span className="block font-semibold text-ink">Setting up for the first time?</span>
            Create the agency admin account
          </span>
          <span aria-hidden className="text-accent transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      ) : null}
    </>
  );
}
