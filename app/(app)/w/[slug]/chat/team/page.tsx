import type { Metadata } from "next";
import { ChatScreen } from "@/components/chat/chat-screen";

export const metadata: Metadata = { title: "Team chat" };

/** Agency-only conversation about this client. Clients get a 404. */
export default async function TeamChatPage({ params }: PageProps<"/w/[slug]/chat/team">) {
  const { slug } = await params;
  return <ChatScreen slug={slug} channel="team" />;
}
