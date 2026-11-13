import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Ban, Cookie, KeyRound, Trash2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { APP_NAME } from "@/lib/env";
import { LEGAL_NAME, PRIVACY_EMAIL, PRIVACY_UPDATED } from "@/lib/legal";
import { STORED_ITEMS } from "@/lib/consent";
import { r2Enabled } from "@/lib/files";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${APP_NAME} collects, uses and protects your information.`,
};

const SECTIONS = [
  { id: "who", title: "Who we are" },
  { id: "collect", title: "What we collect" },
  { id: "use", title: "How we use it" },
  { id: "bases", title: "Why we’re allowed to" },
  { id: "visible", title: "Who can see what" },
  { id: "providers", title: "Services we rely on" },
  { id: "transfers", title: "Where your data is stored" },
  { id: "retention", title: "How long we keep it" },
  { id: "security", title: "How we protect it" },
  { id: "rights", title: "Your choices and rights" },
  { id: "cookies", title: "Cookies" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact us" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const HIGHLIGHTS = [
  { icon: Ban, title: "No ads, no selling", text: "We never sell your data or use it for advertising." },
  { icon: Cookie, title: "Sign-in cookies only", text: "No analytics or tracking cookies, no third-party trackers." },
  { icon: KeyRound, title: "Private by default", text: "You only see the workspaces you belong to. Files are shared through short-lived links." },
  { icon: Trash2, title: "You’re in control", text: "Edit your profile, choose your emails or delete your account from the Account page." },
];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const index = SECTIONS.findIndex((s) => s.id === id);
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-8 first:border-0 first:pt-0">
      <h2 className="flex items-baseline gap-3 text-xl font-semibold text-ink sm:text-[22px]">
        <span className="font-mono text-sm font-normal text-faint tabular-nums">{String(index + 1).padStart(2, "0")}</span>
        {SECTIONS[index].title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-accent">{children}</ul>;
}

function Contact() {
  return PRIVACY_EMAIL ? (
    <a href={`mailto:${PRIVACY_EMAIL}`} className="font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
      {PRIVACY_EMAIL}
    </a>
  ) : (
    <span>your contact at the agency that invited you</span>
  );
}

export default function PrivacyPage() {
  // Follows the same switch as the storage layer, so the policy always names where files really are.
  const filesOnR2 = r2Enabled();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={`${APP_NAME} home`}>
            <Logo />
          </Link>
          <Link href="/" className={buttonClass("ghost", "sm")}>
            <ArrowLeft className="size-4" aria-hidden /> Back to {APP_NAME}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="page-enter">
          <div className="pt-12 pb-10 sm:pt-16">
            <p className="inline-flex items-center rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
              Privacy Policy
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-ink sm:text-5xl">
              Your work stays{" "}
              <span className="text-gradient pe-[0.08em] font-serif text-[1.12em] font-normal tracking-normal italic">yours.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
              {APP_NAME} is where an agency and its clients plan, review and approve social media content. This policy explains what information
              the portal holds about you, why, who can see it and the choices you have.
            </p>
            <p className="mt-3 text-sm text-faint">Last updated {PRIVACY_UPDATED}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur-sm">
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <h.icon className="size-[18px]" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">{h.title}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted">{h.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="mb-3 text-xs font-semibold tracking-wide text-faint uppercase">On this page</p>
              <ol className="space-y-1.5 border-l border-line text-[13px]">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-3 text-muted transition-colors hover:border-accent hover:text-ink">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <article className="max-w-[68ch] space-y-10">
            <Section id="who">
              <p>
                {APP_NAME} is run by {LEGAL_NAME === APP_NAME ? "the agency that gave you access" : LEGAL_NAME} (“we”, “us”). We provide this portal to
                our clients and our own team. When this policy says “the
                agency”, it means the team that creates and manages content in {APP_NAME}; “clients” are the businesses we work for and the people
                they invite.
              </p>
              <p>
                Access is by invitation only. If your organisation uses {APP_NAME} with us, we handle the information in it to deliver the work you
                asked us for, and in line with this policy and our agreement with your organisation.
              </p>
            </Section>

            <Section id="collect">
              <p>We only collect what the portal needs to work:</p>
              <List>
                <li>
                  <strong className="text-ink">Account and profile:</strong> your name, email address and role, and, if you add them, a profile photo,
                  job title and phone number. Your password is stored only as a secure hash by our sign-in provider.
                </li>
                <li>
                  <strong className="text-ink">Workspace information:</strong> details about the client business, brand kit (logos, colours, fonts,
                  tone of voice, links), goals, posting rules, and the files in each client’s library, with who uploaded them and when. Files are kept
                  exactly as uploaded, so details a camera adds to a photo (such as where it was taken) stay with it.
                </li>
                <li>
                  <strong className="text-ink">Content and workflow:</strong> monthly plans, posts, captions, images and videos and their earlier
                  versions, scheduled dates, links to live posts, tasks and progress updates.
                </li>
                <li>
                  <strong className="text-ink">Approvals and feedback:</strong> who approved or asked for changes, when, and what they said, plus
                  comments. This is a record both sides rely on.
                </li>
                <li>
                  <strong className="text-ink">Chat:</strong> messages, attachments (up to 50&nbsp;MB each), who sent them and when, and the point up to
                  which each person has read a conversation. “Typing…” and “here now” indicators are shown live and never stored.
                </li>
                <li>
                  <strong className="text-ink">Sayso assistant (agency staff only):</strong> your conversations with the assistant, including the
                  portal information it looked up to answer, and which AI model answered. Each conversation is private to the staff member who had
                  it. We also record how much each staff member used in each 24-hour period (an estimated cost and a question count, with no
                  question text), so the team&apos;s usage allowance can be enforced.
                </li>
                <li>
                  <strong className="text-ink">Notifications and email preferences:</strong> the alerts you receive, whether you’ve read them, and
                  which emails you’ve chosen to get.
                </li>
                <li>
                  <strong className="text-ink">Last active:</strong> a single time showing when you last used {APP_NAME}, updated at most every few
                  minutes while you have it open. We don’t record what you looked at or for how long.
                </li>
                <li>
                  <strong className="text-ink">Technical information:</strong> sign-in session cookies and the basic request logs our hosting and
                  database providers keep to run and secure the service (such as IP address, browser type and time of request).
                </li>
              </List>
              <p>We don’t ask for payment details, and we don’t collect information about you from data brokers or social networks.</p>
            </Section>

            <Section id="use">
              <List>
                <li>To run the portal: sign you in, show you the right workspaces and move content through review and approval.</li>
                <li>To send the emails the portal depends on: invitations, sign-in links, approval requests, mentions and other alerts you’ve chosen to get.</li>
                <li>To keep a reliable record of what was approved, changed or published, and by whom.</li>
                <li>To keep the service secure, prevent misuse and fix problems.</li>
                <li>To meet legal obligations.</li>
              </List>
              <p>
                We don’t use your information for advertising, we don’t sell or rent it, and we don’t use your content to train AI models. If we add
                a feature that sends your content to another service, we’ll update this policy before it goes live.
              </p>
            </Section>

            <Section id="bases">
              <p>Where data protection law asks us to name a legal basis (for example the GDPR or similar laws), we rely on:</p>
              <List>
                <li>
                  <strong className="text-ink">Contract:</strong> to provide the service you or your organisation signed up for.
                </li>
                <li>
                  <strong className="text-ink">Legitimate interests:</strong> to keep an accurate approval record, keep the service secure and improve
                  it, in ways you’d reasonably expect.
                </li>
                <li>
                  <strong className="text-ink">Consent:</strong> for optional things, such as a profile photo or phone number. You can remove these at
                  any time.
                </li>
                <li>
                  <strong className="text-ink">Legal obligation:</strong> where the law requires us to keep or share information.
                </li>
              </List>
            </Section>

            <Section id="visible">
              <List>
                <li>Client users only see the workspaces they’ve been invited to. Clients never see other clients’ workspaces.</li>
                <li>The agency team sees the workspaces it manages, including everything shared in them.</li>
                <li>Some notes and tasks are marked internal and are only visible to the agency team.</li>
                <li>Agency admins can see when each person last used {APP_NAME}. Nobody else can, apart from you.</li>
                <li>
                  Your name, photo, job title and phone number are visible to the people you work with in {APP_NAME}: the agency team can see client
                  users’ profiles, and signed-in client users can see the agency team’s profiles.
                </li>
                <li>In chat, the agency team can see when people have read their messages (“Seen by”). Clients don’t see read receipts.</li>
              </List>
            </Section>

            <Section id="providers">
              <p>We use a small number of trusted providers to run {APP_NAME}. They process data only on our instructions, to provide their service:</p>
              <List>
                <li>
                  <strong className="text-ink">Supabase:</strong> {filesOnR2 ? "database and sign-in" : "database, sign-in and file storage"}, hosted in
                  Mumbai, India.
                </li>
                {filesOnR2 ? (
                  <li>
                    <strong className="text-ink">Cloudflare R2:</strong> stores files (post photos and videos, library files, chat attachments and
                    profile pictures) in its Asia-Pacific region.
                  </li>
                ) : null}
                <li>
                  <strong className="text-ink">Vercel:</strong> hosts the website and runs its server code; pages are delivered through its global
                  network.
                </li>
                <li>
                  <strong className="text-ink">Resend:</strong> delivers our emails, from its Tokyo, Japan region.
                </li>
                <li>
                  <strong className="text-ink">Anthropic:</strong> powers Sayso, the assistant agency staff can use. When staff ask it a
                  question, the question and the portal information needed to answer it (which can include posts, comments, chat messages and
                  brand-kit text) are sent to Anthropic’s Claude API. Clients don’t use the assistant.
                </li>
              </List>
              <p>
                Fonts and icons are served from our own site, so loading a page doesn’t contact Google or other third parties. We may also share
                information if the law requires it, to protect people’s safety or our rights, or as part of a business transfer, in which case this
                policy will continue to apply.
              </p>
            </Section>

            <Section id="transfers">
              <p>
                {filesOnR2
                  ? "Your account and workspace records are stored in India, and files are stored by Cloudflare in the Asia-Pacific region."
                  : "Your data is stored in India."}{" "}
                Email delivery runs through Japan, assistant questions go to Anthropic, a provider based in the
                United States, and our providers may process limited data in other countries to deliver and support their services. Where information leaves your country, we rely on our providers’ contractual safeguards, such as
                standard contractual clauses, to protect it.
              </p>
            </Section>

            <Section id="retention">
              <List>
                <li>
                  <strong className="text-ink">Your account:</strong> kept while you have access. When you delete your account, we remove your
                  profile, photo, workspace memberships, last-active time, notifications, read markers and assistant conversations. The same applies
                  when an agency admin removes you.
                </li>
                <li>
                  <strong className="text-ink">What you contributed:</strong> comments, approvals, chat messages and tasks you wrote stay in the
                  workspace after you leave, with the author shown as “Former member”. This keeps an honest record of what was agreed.
                </li>
                <li>
                  <strong className="text-ink">Workspace content:</strong> kept for as long as the workspace exists. When an engagement ends, the
                  client can ask us to delete the workspace and its files.
                </li>
                <li>
                  <strong className="text-ink">Chat:</strong> kept for the life of the workspace. When a message is deleted by its author or an agency
                  admin, its text and attachments are removed, including from notification previews.
                </li>
                <li>
                  <strong className="text-ink">Assistant conversations:</strong> kept in your account until you delete them or delete your account.
                  Nobody else can see them, including agency admins. The usage record is kept until you delete your account.
                </li>
                <li>
                  <strong className="text-ink">Logs:</strong> request and email delivery logs are kept by our providers for a limited period.
                  Deleted data may remain in backups for a short time before it’s overwritten.
                </li>
              </List>
            </Section>

            <Section id="security">
              <List>
                <li>Every request is checked against your workspace membership at the database level, so people can only reach data they’re allowed to see.</li>
                <li>Content, workspace files and chat attachments are kept in private storage and shared through links that expire quickly.</li>
                <li>
                  Profile photos are the exception: they’re stored under a random, hard-to-guess address so they load quickly, which means anyone with
                  that exact link can view the photo. Replacing or removing your photo deletes the old file.
                </li>
                <li>All traffic is encrypted in transit (HTTPS). Sign-in links expire, and changing your email needs confirmation from the new address.</li>
                <li>You can sign out of every device at once from the Account page.</li>
              </List>
              <p>No system is perfectly secure. If we become aware of a breach that affects you, we’ll tell you and the relevant authorities as the law requires.</p>
            </Section>

            <Section id="rights">
              <p>Depending on where you live, you may have the right to:</p>
              <List>
                <li>see the information we hold about you and get a copy of it;</li>
                <li>correct it (you can edit most of your profile yourself on the Account page);</li>
                <li>delete it (you can delete your account yourself on the Account page);</li>
                <li>object to or restrict certain uses, and withdraw consent you’ve given;</li>
                <li>complain to your local data protection authority.</li>
              </List>
              <p>
                You can choose which emails you get on the Account page. The only agency admin can’t delete their own account until another admin
                is in place, so the agency’s workspaces always have an owner. For anything else, contact <Contact />. We’ll reply within 30 days.
              </p>
            </Section>

            <Section id="cookies">
              <p>
                {APP_NAME} uses only essential cookies that keep you signed in and protect your session. We don’t use analytics, advertising or
                tracking cookies. Before you sign in, we ask you to accept them, and we remember your choice for 12 months. Because sign-in depends on
                these cookies, the portal can’t be used without them. This is what we store in your browser:
              </p>
              <List>
                {STORED_ITEMS.map((item) => (
                  <li key={item.name}>
                    <strong className="text-ink">{item.name}:</strong> {item.purpose} Kept: {item.lasts.toLowerCase()}.
                  </li>
                ))}
              </List>
              <p>
                To withdraw your choice, use “Withdraw cookie consent” on the Account page, or clear this site’s cookies in your browser. Either
                signs you out on that browser, and we’ll ask again next time.
              </p>
            </Section>

            <Section id="children">
              <p>{APP_NAME} is a business tool and isn’t meant for anyone under 16. We don’t knowingly collect information from children.</p>
            </Section>

            <Section id="changes">
              <p>
                If we change this policy, we’ll update the date at the top. If a change is significant, we’ll let you know in the portal or by email
                before it takes effect.
              </p>
            </Section>

            <Section id="contact">
              <p>
                Questions or requests about your privacy? Contact <Contact />.
              </p>
            </Section>
          </article>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:px-6">
          <span>
            © {PRIVACY_UPDATED.slice(-4)} {LEGAL_NAME}
          </span>
          <Link href="/login" className="hover:text-ink">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
