import type { Metadata } from "next";
import Image from "next/image";
import { getMyWorkspaces, requireViewer } from "@/lib/auth";
import { APP_NAME } from "@/lib/env";
import { Card } from "@/components/ui";
import { FadeIn } from "@/components/anim";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { completeWelcome } from "@/app/actions/account";
import { safeNext } from "@/lib/utils";

export const metadata: Metadata = { title: "Welcome" };

/**
 * First stop after accepting an invite (after the welcome animation). It opens
 * with the same image as the invite email, so it feels like one journey.
 */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const [viewer, sp, workspaces] = await Promise.all([requireViewer(), searchParams, getMyWorkspaces()]);
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const isClient = viewer.side === "client";
  const firstName = viewer.name.split(" ")[0];
  const workspace = isClient && workspaces.length === 1 ? workspaces[0].name : null;

  const intro = isClient
    ? workspace
      ? `Review and approve ${workspace}'s posts here before anything goes live.`
      : "Review and approve your posts here before anything goes live."
    : "Plan the month, send posts for approval and publish with your clients' say-so.";

  return (
    <div className="mx-auto max-w-xl">
      <FadeIn>
        <Image
          src="/brand/email-invite.jpg"
          alt=""
          width={1120}
          height={480}
          priority
          className="aspect-[1120/480] w-full rounded-3xl object-cover"
        />
        <h1 className="mt-7 text-[1.85rem] leading-tight font-bold tracking-tight text-ink sm:text-[2.1rem]">
          Welcome to {APP_NAME}, {firstName}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{intro}</p>

        <Card className="mt-7 p-5 sm:p-6">
          <ActionForm action={completeWelcome} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div>
              <label className="label" htmlFor="name">
                Your name
              </label>
              <input id="name" name="name" defaultValue={viewer.name} required autoComplete="name" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password (optional)
              </label>
              <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" className="field" />
              <p className="hint">Leave it blank to sign in with an email link instead.</p>
            </div>
            <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
              Continue
            </SubmitButton>
          </ActionForm>
        </Card>
      </FadeIn>
    </div>
  );
}
