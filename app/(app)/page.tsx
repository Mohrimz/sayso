import { avatarUrl } from "@/lib/avatar";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyWorkspaces, getViewer } from "@/lib/auth";
import { Avatar, Card } from "@/components/ui";

/** Sends people to the right place: agency to the dashboard, clients to their workspace. */
export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.side === "agency") redirect("/dashboard");

  const workspaces = await getMyWorkspaces();
  if (workspaces.length === 1) redirect(`/w/${workspaces[0].slug}`);

  if (!workspaces.length) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <h1 className="text-lg font-semibold">You&apos;re signed in</h1>
        <p className="mt-1 text-sm text-muted">
          Your account isn&apos;t linked to a client workspace yet. Ask your agency contact to add you.
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Choose a workspace</h1>
      <Card className="divide-y divide-line">
        {workspaces.map((w) => (
          <Link key={w.id} href={`/w/${w.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
            <Avatar name={w.name} src={avatarUrl(w.logo_path)} />
            <span className="font-medium">{w.name}</span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
