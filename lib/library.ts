/** Shared by the Library page, its uploader and its actions. */

export type AssetKind = "photo" | "video" | "document";

export const ASSET_KINDS: { key: AssetKind; label: string }[] = [
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
  { key: "document", label: "Documents" },
];

/** Folders offered when uploading. People can also type their own. */
export const SUGGESTED_FOLDERS = ["Product photos", "Product videos", "Brand", "Team and behind the scenes", "Customer content", "Documents"];

export const MAX_FILE_BYTES = 500 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 50;

export function assetKind(mime: string): AssetKind {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "–";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Tidy folder name: trimmed, single spaces, at most 60 characters. */
export function cleanFolder(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 60) || "General";
}

/** File extension for showing on document tiles, e.g. "PDF". */
export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return match ? match[1].toUpperCase() : "FILE";
}
