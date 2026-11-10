import { notFound } from "next/navigation";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadChat } from "@/lib/chat-data";
import { zonedDayKey } from "@/lib/dates";
import type { ChatChannel } from "@/lib/chat";
import { ChatFrame } from "./chat-frame";
import { ChatRoom } from "./chat-room";

async function unreadIn(workspaceId: string, channel: ChatChannel, viewerId: string) {
  const supabase = await createClient();
  const { data: mark } = await supabase
    .from("chat_reads")
    .select("last_read_at")
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .eq("user_id", viewerId)
    .maybeSingle();
  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .is("deleted_at", null)
    .neq("author_id", viewerId);
  if (mark) query = query.gt("created_at", mark.last_read_at);
  const { count } = await query;
  return count ?? 0;
}

/** A workspace conversation: the shared client chat, or the agency's team-only chat. */
export async function ChatScreen({ slug, channel }: { slug: string; channel: ChatChannel }) {
  const access = await getWorkspaceAccess(slug);
  if (channel === "team" && !access.can.isAgency) notFound();
  const { workspace, viewer, can } = access;

  const [data, otherUnread] = await Promise.all([
    loadChat(access, channel),
    can.isAgency ? unreadIn(workspace.id, channel === "client" ? "team" : "client", viewer.id) : Promise.resolve(0),
  ]);

  return (
    <ChatFrame>
      <ChatRoom
        key={`${workspace.id}:${channel}`}
        workspace={{ id: workspace.id, slug: workspace.slug, name: workspace.name, timeZone: workspace.time_zone }}
        channel={channel}
        viewer={{ id: viewer.id, name: viewer.name, isAgency: can.isAgency, isAdmin: access.role === "admin" }}
        initial={data}
        otherUnread={otherUnread}
        serverToday={zonedDayKey(new Date().toISOString(), workspace.time_zone)}
      />
    </ChatFrame>
  );
}
