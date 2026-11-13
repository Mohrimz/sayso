/**
 * Chat types and helpers shared by the server and the browser.
 *
 * Each client workspace has a "client" conversation (the client and the
 * agency team), a "team" conversation (agency only) and a "direct" one
 * (agency admins and the client only; team members can't see it). Files live in the private
 * chat-files bucket under <workspace>/<channel>/<upload id>/<file>.
 */

export type ChatChannel = "client" | "team" | "direct";

/** The conversations a person can open for a client, in tab order. */
export function channelsFor(viewer: { isAgency: boolean; isAdmin: boolean }): ChatChannel[] {
  if (!viewer.isAgency) return ["client", "direct"];
  return viewer.isAdmin ? ["client", "direct", "team"] : ["client", "team"];
}

export type ChatAttachment = { path: string; name: string; mime: string; size: number };

export type ChatMessage = {
  id: string;
  author_id: string | null;
  body: string;
  attachments: ChatAttachment[];
  /** People @mentioned in the message (the text keeps plain "@Name"). */
  mentions: string[];
  /** The message this one answers, if any. */
  reply_to: string | null;
  /** Emoji reactions: each emoji with the ids of the people who chose it. */
  reactions: Record<string, string[]>;
  created_at: string;
  /** When the author last changed the text, if they did. */
  edited_at: string | null;
  deleted_at: string | null;
};

export type ChatPerson = { id: string; name: string; side: "agency" | "client"; avatar?: string | null; jobTitle?: string | null };

/** Everything the chat screen needs on first load. */
export type ChatData = {
  messages: ChatMessage[];
  hasMore: boolean;
  people: Record<string, ChatPerson>;
  /** Everyone who can read this conversation, for the header. */
  participants: string[];
  /** The viewer's "read up to" time before this visit (for the New divider). */
  lastReadAt: string | null;
  /** Other people's "read up to" times (for "Seen by"). */
  readers: Record<string, string>;
  signed: Record<string, string>;
};

export const CHAT_BUCKET = "chat-files";
export const CHAT_PAGE_SIZE = 50;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FILES_PER_MESSAGE = 10;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Signed file links stay valid for a working day, so long-open chats keep their images. */
export const SIGNED_URL_TTL = 60 * 60 * 12;

export const MESSAGE_COLUMNS = "id, author_id, body, attachments, mentions, reply_to, reactions, created_at, edited_at, deleted_at";
export const MAX_MENTIONS = 20;

export function isChannel(value: unknown): value is ChatChannel {
  return value === "client" || value === "team" || value === "direct";
}

export function chatHref(slug: string, channel: ChatChannel = "client") {
  return `/w/${slug}/chat${channel === "team" ? "/team" : channel === "direct" ? "/direct" : ""}`;
}

/** Key for unread counts: one per workspace and conversation. */
export function chatKey(workspaceId: string, channel: ChatChannel) {
  return `${workspaceId}:${channel}`;
}

/** "<workspace>/<channel>/" — every attachment path must start with this. */
export function attachmentPrefix(workspaceId: string, channel: ChatChannel) {
  return `${workspaceId}/${channel}/`;
}

/** The reactions people can choose, in the order they're offered. */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export function parseReactions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [emoji, people] of Object.entries(value)) {
    const ids = Array.isArray(people) ? people.filter((p): p is string => typeof p === "string") : [];
    if (ids.length) out[emoji] = ids;
  }
  return out;
}

export function parseAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .filter((a) => typeof a.path === "string")
    .map((a) => ({
      path: String(a.path),
      name: typeof a.name === "string" && a.name ? a.name : String(a.path).split("/").pop() || "file",
      mime: typeof a.mime === "string" && a.mime ? a.mime : "application/octet-stream",
      size: Number(a.size) || 0,
    }));
}

export function toChatMessage(row: {
  id: string;
  author_id: string | null;
  body: string;
  attachments: unknown;
  mentions?: unknown;
  reply_to?: unknown;
  reactions?: unknown;
  created_at: string;
  edited_at?: string | null;
  deleted_at: string | null;
}): ChatMessage {
  return {
    id: row.id,
    author_id: row.author_id,
    body: row.body ?? "",
    attachments: parseAttachments(row.attachments),
    mentions: Array.isArray(row.mentions) ? row.mentions.filter((m): m is string => typeof m === "string") : [],
    reply_to: typeof row.reply_to === "string" ? row.reply_to : null,
    reactions: parseReactions(row.reactions),
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at,
  };
}

export function attachmentKind(mime: string): "image" | "video" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** A storage-safe file name that keeps the extension. */
export function safeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "file";
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "";
  return ext ? `${base}.${ext}` : base;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * A random v4 id. crypto.randomUUID only exists on secure origins, so phones
 * testing over a LAN address (plain http) fall back to getRandomValues.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
