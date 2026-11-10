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
    // Agency admins check posts in internal review and send them to the client,
    // and decide when the client sees a month. Team members send posts for review.
    sendToClient: role === "admin",
    sharePlan: role === "admin",
    approve: role === "approver",
    comment: true,
    uploadFiles: agency || role === "approver",
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
