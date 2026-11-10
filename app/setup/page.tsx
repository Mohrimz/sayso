import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { Skeleton } from "@/components/ui";
import { hasAgencyAdmin } from "@/lib/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

export default function SetupPage() {
  return (
    <AuthShell title="Set up your portal" subtitle="Create the first agency admin account. You can invite the rest of the team next.">
      <Suspense fallback={<Skeleton className="h-72" />}>
        <SetupGate />
      </Suspense>
    </AuthShell>
  );
}

async function SetupGate() {
  if (await hasAgencyAdmin()) redirect("/login");
  return <SetupForm />;
}
