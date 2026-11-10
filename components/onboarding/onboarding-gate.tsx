import { getMyWorkspaces, getViewer } from "@/lib/auth";
import { Onboarding } from "./onboarding";

/**
 * Shows a client's first sign-in setup over the app until they've finished it.
 * Agency staff, and everyone who was here before it existed, never see it.
 */
export async function OnboardingGate() {
  const viewer = await getViewer();
  if (!viewer || viewer.side !== "client" || viewer.onboardedAt) return null;
  const [workspace] = await getMyWorkspaces();
  return (
    <Onboarding
      userId={viewer.id}
      email={viewer.email}
      placeholderEmail={viewer.placeholderEmail}
      name={viewer.hasName ? viewer.name : ""}
      jobTitle={viewer.jobTitle ?? ""}
      phone={viewer.phone ?? ""}
      avatarUrl={viewer.avatarUrl}
      workspaceName={workspace?.name ?? null}
    />
  );
}
