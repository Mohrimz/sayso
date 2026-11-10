import { getViewer } from "@/lib/auth";
import { claudeConfigured } from "@/lib/claude";
import { SaysoLauncher } from "./sayso-launcher";

/** Adds the Sayso corner button for agency staff when a Claude API key is set. */
export async function SaysoDock() {
  const viewer = await getViewer();
  if (!viewer || viewer.side !== "agency" || !claudeConfigured()) return null;
  return <SaysoLauncher userId={viewer.id} firstName={viewer.name.split(" ")[0]} />;
}
