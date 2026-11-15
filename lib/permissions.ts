/**
 * What each role can do, mirroring the "Users and roles" table in the spec.
 * These checks drive the UI; the database enforces the same rules with
 * row-level security and the workflow functions.
 */
export type WorkspaceRole = "admin" | "team_member" | "approver" | "viewer";

export function permissionsFor(role: WorkspaceRole) {
  const agency = role === "admin" || role === "team_member";
  return {
    isAgency: agency,
    isClient: !agency,
    manageWorkspace: role === "admin",
    inviteMembers: role === "admin" || role === "approver",
    managePlans: agency,
    editContent: agency,
    sendForApproval: agency,
    // The whole agency team sends posts to the client (user, 2026-11-14).
    // Only admins decide when the client sees a month.
    sendToClient: agency,
    sharePlan: role === "admin",
    approve: role === "approver",
    comment: true,
    // Everyone can add files to the Library; a client's go into their own "From the client" folder.
    uploadFiles: true,
    editBrandKit: agency || role === "approver",
    // Publishing (and "Mark as published") is for agency admins; team members request it.
    markPublished: role === "admin",
    seeInternal: agency,
    seeBilling: role === "admin" || role === "approver",
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: "Agency admin",
  team_member: "Team member",
  approver: "Approver",
  viewer: "Viewer",
};
