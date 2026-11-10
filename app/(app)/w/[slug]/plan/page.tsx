import { redirect } from "next/navigation";
import { getWorkspaceAccess } from "@/lib/auth";
import { currentMonth } from "@/lib/dates";

export default async function PlanIndex({ params, searchParams }: PageProps<"/w/[slug]/plan">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { workspace } = await getWorkspaceAccess(slug);
  // Keeps the walkthrough going (?tour=2) through the redirect to this month.
  const tour = typeof sp.tour === "string" && /^\d{1,2}$/.test(sp.tour) ? `?tour=${sp.tour}` : "";
  redirect(`/w/${workspace.slug}/plan/${currentMonth(workspace.time_zone)}${tour}`);
}
