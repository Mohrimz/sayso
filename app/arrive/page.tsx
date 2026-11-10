import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/utils";
import { ArrivalStart, ARRIVAL_BACKGROUND } from "@/components/arrival/arrival";

export const metadata: Metadata = { title: "Welcome" };

/**
 * First stop after signing in: plays the welcome animation, then opens the
 * page the person was heading to. The dark background matches the animation,
 * so nothing flashes while it starts.
 */
export default function ArrivePage({ searchParams }: PageProps<"/arrive">) {
  return (
    <div className="fixed inset-0" style={{ backgroundColor: ARRIVAL_BACKGROUND }}>
      <Suspense fallback={null}>
        <Arrive searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Arrive({ searchParams }: { searchParams: PageProps<"/arrive">["searchParams"] }) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!viewer) redirect("/login");

  let to = safeNext(typeof params.to === "string" ? params.to : null);
  if (to.startsWith("/arrive")) to = "/";
  const kind = params.kind === "new" ? "new" : "back";
  return <ArrivalStart name={viewer.name.split(" ")[0]} kind={kind} to={to} />;
}
