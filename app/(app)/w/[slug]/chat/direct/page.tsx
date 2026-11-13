import type { Metadata } from "next";
import { ChatScreen } from "@/components/chat/chat-screen";

export const metadata: Metadata = { title: "Direct chat" };

/** The private conversation between the agency admins and this client. Team members get a 404. */
export default async function DirectChatPage({ params }: PageProps<"/w/[slug]/chat/direct">) {
  const { slug } = await params;
  return <ChatScreen slug={slug} channel="direct" />;
}
