import type { Metadata } from "next";
import { ChatScreen } from "@/components/chat/chat-screen";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: PageProps<"/w/[slug]/chat">) {
  const { slug } = await params;
  return <ChatScreen slug={slug} channel="client" />;
}
