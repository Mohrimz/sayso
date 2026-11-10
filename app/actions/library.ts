"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileInfo, removeFiles, signedUrl } from "@/lib/files";
import { findWorkspaceAccess } from "@/lib/auth";
import { deliverNotificationsLater, done, fail, friendlyError, str } from "@/lib/action-helpers";
import { cleanFolder, MAX_FILES_PER_UPLOAD } from "@/lib/library";
import { isUuid } from "@/lib/chat";
import type { ActionState } from "./types";


export type UploadedFile = { path: string; name: string; mime: string; size: number };

/**
 * Adds files that were just uploaded to storage to a client's Library. When a
 * client adds files, the agency team is told.
 */
export async function recordUploads(workspaceId: string, folder: string, files: UploadedFile[]): Promise<ActionState> {
  if (!isUuid(workspaceId)) return fail("Client not found.");
  const access = await findWorkspaceAccess("id", workspaceId);
  if (!access?.can.uploadFiles) return fail("You can't add files to this Library.");
  if (!Array.isArray(files) || !files.length) return fail("No files were uploaded.");
  if (files.length > MAX_FILES_PER_UPLOAD) return fail(`Add up to ${MAX_FILES_PER_UPLOAD} files at a time.`);

  const prefix = `${workspaceId}/library/`;
  const rows = files
    .filter((f) => typeof f.path === "string" && f.path.startsWith(prefix) && !f.path.includes(".."))
    .map((f) => ({
      workspace_id: workspaceId,
      path: f.path,
      name: String(f.name || "file").slice(0, 200),
      folder: cleanFolder(folder),
      mime: String(f.mime || "application/octet-stream").slice(0, 100),
      size: Math.max(0, Math.round(Number(f.size) || 0)),
      uploaded_by: access.viewer.id,
    }));
  if (!rows.length) return fail("No files were uploaded.");

  // Only record files that really arrived in storage, with their real size.
  const arrived = await Promise.all(rows.map((r) => fileInfo("workspace-files", r.path).catch(() => null)));
  const stored = rows.flatMap((r, i) => (arrived[i] ? [{ ...r, size: arrived[i]!.size || r.size }] : []));
  if (!stored.length) return fail("The files didn't finish uploading. Please try again.");

  const supabase = await createClient();
  const { error } = await supabase.from("assets").insert(stored);
  if (error) return fail(friendlyError(error));

  if (access.viewer.side === "client") {
    // Agency admins plus the team members working on this client.
    const admin = createAdminClient();
    const [{ data: admins }, { data: team }] = await Promise.all([
      admin.from("profiles").select("id").eq("side", "agency").eq("agency_role", "admin"),
      admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "team_member"),
    ]);
    const recipients = [...new Set([...(admins ?? []).map((a) => a.id), ...(team ?? []).map((t) => t.user_id)])];
    const count = rows.length;
    if (recipients.length) {
      await admin.from("notifications").insert(
        recipients.map((user_id) => ({
          user_id,
          workspace_id: workspaceId,
          type: "files_added",
          title: `${access.viewer.name} added ${count} ${count === 1 ? "file" : "files"} to ${access.workspace.name}'s Library`,
          body: `In “${rows[0].folder}”.`,
          link: `/w/${access.workspace.slug}/library?folder=${encodeURIComponent(rows[0].folder)}`,
        })),
      );
      deliverNotificationsLater();
    }
  }

  refresh();
  return done(`${rows.length} ${rows.length === 1 ? "file" : "files"} added to “${rows[0].folder}”.`);
}

/** Renames a file, moves it to another folder, or changes its note. Agency admins only. */
export async function updateAsset(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  if (!isUuid(id)) return fail("File not found.");
  const name = str(fd, "name").slice(0, 200);
  if (!name) return fail("Give the file a name.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ name, folder: cleanFolder(str(fd, "folder")), note: str(fd, "note").slice(0, 500) || null })
    .eq("id", id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("Only agency admins can change library files.");
  refresh();
  return done("Saved.");
}

/** Deletes a file from the Library and from storage. Agency admins only. */
export async function deleteAsset(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  if (!isUuid(id)) return fail("File not found.");
  const supabase = await createClient();
  const { data: asset } = await supabase.from("assets").select("id, path, workspace_id, uploaded_by").eq("id", id).maybeSingle();
  if (!asset) return fail("File not found.");
  const access = await findWorkspaceAccess("id", asset.workspace_id);
  if (access?.role !== "admin") return fail("Only agency admins can delete library files.");

  const { error } = await supabase.from("assets").delete().eq("id", asset.id);
  if (error) return fail(friendlyError(error));
  // The file itself. The record above was the permission check.
  await removeFiles("workspace-files", [asset.path]).catch((e) => console.error("[library] file not removed", e));
  refresh();
  return done("File deleted.");
}

/** A short-lived link that downloads the file with its own name. */
export async function assetDownloadUrl(id: string): Promise<{ url: string } | { error: string }> {
  if (!isUuid(id)) return { error: "File not found." };
  const supabase = await createClient();
  const { data: asset } = await supabase.from("assets").select("path, name").eq("id", id).maybeSingle();
  if (!asset) return { error: "File not found." };
  const url = await signedUrl("workspace-files", asset.path, { expiresIn: 300, download: asset.name }).catch(() => null);
  if (!url) return { error: "The download couldn't be prepared. Please try again." };
  return { url };
}
