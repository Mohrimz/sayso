import type { Metadata } from "next";
import { requireAgency } from "@/lib/auth";
import { claudeConfigured } from "@/lib/claude";
import { isUuid } from "@/lib/chat";
import { APP_NAME } from "@/lib/env";
import { Card, EmptyState } from "@/components/ui";
import { SaysoChat } from "@/components/assistant/sayso-chat";

export const metadata: Metadata = { title: `${APP_NAME} assistant` };

/** Sayso full screen: the team assistant with saved chats alongside. */
export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const viewer = await requireAgency();
  const { chat } = await searchParams;

  if (!claudeConfigured()) {
    return (
      <Card>
        <EmptyState title={`${APP_NAME} isn't set up yet`}>
          An admin needs to add a Claude API key (ANTHROPIC_API_KEY) to the server settings.
        </EmptyState>
      </Card>
    );
  }

  return (
    <SaysoChat
      variant="page"
      userId={viewer.id}
      firstName={viewer.name.split(" ")[0]}
      initialChatId={typeof chat === "string" && isUuid(chat) ? chat : undefined}
    />
  );
}
