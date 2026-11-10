import "server-only";
import { Resend } from "resend";
import { createTransport, type Transporter } from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/env";
import { asObject, type NotificationPrefs } from "@/lib/types";
import { isPlaceholderEmail } from "@/lib/placeholder-email";

const FROM =
  process.env.EMAIL_FROM ||
  (process.env.SMTP_USER?.includes("@") ? `${APP_NAME} <${process.env.SMTP_USER}>` : `${APP_NAME} <onboarding@resend.dev>`);

/**
 * Which service sends email, in this order:
 * - Cloudflare Email Service, when its account ID and API token are set
 * - Resend, when RESEND_API_KEY is set
 * - any SMTP server (e.g. Gmail with an app password), when SMTP_HOST is set
 * Otherwise emails are only printed to the server log (development).
 */
type EmailProvider = "cloudflare" | "resend" | "smtp" | null;

function emailProvider(): EmailProvider {
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_EMAIL_API_TOKEN) return "cloudflare";
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return null;
}

let smtp: Transporter | null = null;

/** Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=you@gmail.com, SMTP_PASS=<app password>. */
async function sendViaSmtp(opts: SendOptions): Promise<SendResult> {
  const port = Number(process.env.SMTP_PORT || 465);
  smtp ??= createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  try {
    await smtp.sendMail({ from: fromWithName(opts.fromName), to: opts.to, replyTo: opts.replyTo, subject: opts.subject, html: opts.html, text: opts.text });
    return { ok: true, dev: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[email] SMTP send failed:", message);
    return { ok: false, error: message };
  }
}

export function emailConfigured() {
  return emailProvider() !== null;
}

/** "Sayso <hello@example.com>" -> { name: "Sayso", email: "hello@example.com" } */
function parseAddress(value: string): { email: string; name?: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  return match[1] ? { name: match[1], email: match[2].trim() } : { email: match[2].trim() };
}

type SendResult = { ok: true; dev: boolean } | { ok: false; error: string };

type SendOptions = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Shown as "<name> via Sayso" in the inbox. The address stays the verified sender. */
  fromName?: string;
  /** Where replies go, e.g. the person who sent an invitation. */
  replyTo?: string;
};

/** Cloudflare Email Service REST API (requires a domain on Cloudflare and the Workers Paid plan). */
async function sendViaCloudflare(opts: SendOptions): Promise<SendResult> {
  const base = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";
  try {
    const res = await fetch(`${base}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: parseAddress(fromWithName(opts.fromName)),
        to: opts.to,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; errors?: { code: number; message: string }[] } | null;
    if (!res.ok || !json?.success) {
      const message = json?.errors?.map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${res.status}`;
      console.error("[email] Cloudflare send failed:", message);
      return { ok: false, error: message };
    }
    return { ok: true, dev: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[email] Cloudflare send failed:", message);
    return { ok: false, error: message };
  }
}

/** True when sign-in links may be shown on screen (local development only). */
export function devLinksAllowed() {
  return process.env.NODE_ENV !== "production" && !emailConfigured();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type EmailContent = {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Preview text shown after the subject in the inbox list. */
  preheader?: string;
  /** Small print under the button, e.g. when the link expires. */
  note?: string;
  /** Why they got this email. Defaults to a line about email settings. */
  reason?: string;
  /** "invite" uses the large photographic header; everything else gets the slim brand bar. */
  header?: "invite" | "standard";
};

const BODY_FONT = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const HEADING_FONT = "'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/**
 * The email layout shared by every email.
 *
 * - The header is an image: generated art with the real wordmark baked in, in
 *   public/brand/email-*.jpg. Images aren't recoloured in dark mode, so the
 *   brand looks the same in every inbox.
 * - The button is ember with white text, which survives Gmail's dark-mode inversion.
 * - Table layout with inline styles, so Outlook renders it too.
 */
export function renderEmail(opts: EmailContent) {
  const e = escapeHtml;
  const site = e(SITE_URL);
  const host = e(new URL(SITE_URL).host);
  const invite = opts.header === "invite";
  const font = (size: number, color: string, extra = "") => `font-family:${BODY_FONT};font-size:${size}px;line-height:1.65;color:${color};${extra}`;
  const small = font(12, "#8b867d", "line-height:1.6");

  const headerImage = invite
    ? { src: "email-invite.jpg", height: 240 }
    : { src: "email-header.jpg", height: 80 };
  const header = `<img src="${site}/brand/${headerImage.src}" width="560" height="${headerImage.height}" alt="${e(APP_NAME)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;outline:none;border-radius:12px 12px 0 0;background:#17151c;${font(20, "#f6f1e7", "font-weight:700")}">`;

  const body = opts.paragraphs.map((p) => `<p class="soft" style="margin:0 0 16px;${font(15, "#4a463f")}">${e(p)}</p>`).join("");

  const button = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0"><tr>
<td bgcolor="#cf4318" style="border-radius:8px;background:#cf4318">
<a href="${e(opts.cta.url)}" target="_blank" style="display:inline-block;padding:13px 26px;border-radius:8px;${font(15, "#ffffff", "font-weight:600;line-height:1.2;text-decoration:none")}">${e(opts.cta.label)}</a>
</td></tr></table>`
    : "";

  const note = opts.note ? `<p class="muted" style="margin:18px 0 0;${font(13, "#8b867d")}">${e(opts.note)}</p>` : "";

  const fallback = opts.cta
    ? `<tr><td class="px" style="padding:0 44px 36px">
<p class="muted rule" style="margin:0;padding-top:22px;border-top:1px solid #ece9e3;${font(12, "#8b867d")}">If the button doesn't work, paste this link into your browser:<br>
<a href="${e(opts.cta.url)}" target="_blank" class="link" style="color:#6b665d;word-break:break-all;text-decoration:underline">${e(opts.cta.url)}</a></p>
</td></tr>`
    : `<tr><td style="padding:0 0 20px;font-size:0;line-height:0">&nbsp;</td></tr>`;

  const reason = opts.reason
    ? e(opts.reason)
    : `You're receiving this because you have a ${e(APP_NAME)} account. You can choose which emails you get in <a href="${site}/account" style="color:#8b867d;text-decoration:underline">account settings</a>.`;

  // Spacer characters stop inbox previews from pulling in the email body after the preheader.
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${e(opts.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(opts.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
@media (max-width:600px){.px{padding-left:26px!important;padding-right:26px!important}.h1{font-size:24px!important}}
@media (prefers-color-scheme:dark){
.bg{background:#0f0e12!important}.card{background:#1b1a1f!important;border-color:#2e2c33!important}
.ink{color:#f3f0ea!important}.soft{color:#d3cec4!important}.muted{color:#9d978c!important}.rule{border-color:#35323b!important}.link{color:#c9c3b8!important}
}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f1f0ed;-webkit-text-size-adjust:100%">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f1f0ed"><tr><td align="center" style="padding:36px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" style="max-width:560px;background:#ffffff;border:1px solid #e6e3dd;border-radius:12px">
<tr><td style="padding:0;line-height:0;font-size:0">${header}</td></tr>
<tr><td class="px" style="padding:${invite ? 40 : 36}px 44px 32px">
<h1 class="ink h1" style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:${invite ? 28 : 24}px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#17151c">${e(opts.heading)}</h1>
${body}${button}${note}
</td></tr>
${fallback}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px"><tr><td class="px" style="padding:24px 44px 0">
<p class="muted" style="margin:0 0 10px;${small}"><strong style="color:#6b665d;font-weight:600">${e(APP_NAME)}</strong> &middot; ${e(APP_TAGLINE)}</p>
<p class="muted" style="margin:0 0 10px;${small}">${reason}</p>
<p class="muted" style="margin:0;${small}"><a href="${site}" target="_blank" style="color:#8b867d;text-decoration:underline">${host}</a> &middot; <a href="${site}/privacy" target="_blank" style="color:#8b867d;text-decoration:underline">Privacy Policy</a></p>
</td></tr></table>
</td></tr></table>
</body>
</html>`;

  const plain = [
    opts.heading,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    ...(opts.cta ? [`${opts.cta.label}: ${opts.cta.url}`, ""] : []),
    ...(opts.note ? [opts.note, ""] : []),
    "—",
    opts.reason ?? `You're receiving this because you have a ${APP_NAME} account. Choose which emails you get in account settings: ${SITE_URL}/account`,
    `${APP_NAME} · ${SITE_URL}`,
  ].join("\n");
  return { html, text: plain };
}

/** Sender name shown in the inbox, e.g. "Ummu Saleema via Sayso" for invitations. */
function fromWithName(name?: string) {
  if (!name) return FROM;
  const { email } = parseAddress(FROM);
  const clean = name.replace(/["<>\r\n]/g, "").trim().slice(0, 60);
  return clean ? `"${clean} via ${APP_NAME}" <${email}>` : FROM;
}

export async function sendEmail(opts: SendOptions): Promise<SendResult> {
  // Placeholder logins (e.g. acme@sayso.mohrimz.com) have no inbox: skip them rather than bounce.
  if (isPlaceholderEmail(opts.to)) {
    console.info(`[email] not sent to placeholder address ${opts.to}: ${opts.subject}`);
    return { ok: true as const, dev: false };
  }
  const provider = emailProvider();
  if (!provider) {
    console.info(
      `\n[email] (not sent: no email service configured; set SMTP_* for Gmail, RESEND_API_KEY, or CLOUDFLARE_*)\n  To: ${opts.to}\n  Subject: ${opts.subject}\n  ${opts.text.replace(/\n/g, "\n  ")}\n`,
    );
    return { ok: true as const, dev: true };
  }
  if (provider === "cloudflare") return sendViaCloudflare(opts);
  if (provider === "smtp") return sendViaSmtp(opts);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: fromWithName(opts.fromName),
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  if (error) {
    console.error("[email] failed", error);
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const, dev: false };
}

const PREF_FOR_TYPE: Record<string, keyof NotificationPrefs> = {
  approval_requested: "email_approvals",
  approved: "email_approvals",
  publish_requested: "email_approvals",
  review_requested: "email_approvals",
  changes_requested: "email_changes",
  comment: "email_comments",
  task_assigned: "email_tasks",
  task_submitted: "email_tasks",
  task_reviewed: "email_tasks",
  message: "email_messages",
  mention: "email_messages",
  offer: "email_offers",
};

const CTA_FOR_TYPE: Record<string, string> = {
  task_submitted: "Review the work",
  task_reviewed: "Open your tasks",
  approval_requested: "Review and approve",
  publish_requested: "Open the post",
  review_requested: "Review the post",
  files_added: "Open the Library",
  offer: "See the offer",
  message: "Open the chat",
  mention: "Open the chat",
};

/**
 * Emails notifications that haven't been emailed yet. Rows are claimed in a
 * single update, so overlapping runs never send the same email twice.
 */
export async function deliverPendingNotifications() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();

  const { data: claimed, error } = await admin
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .is("emailed_at", null)
    .gte("created_at", since)
    .select("id, user_id, type, title, body, link, read_at");
  if (error || !claimed?.length) return;

  const userIds = [...new Set(claimed.map((n) => n.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, notification_prefs")
    .in("id", userIds);

  for (const profile of profiles ?? []) {
    const prefs = asObject<Partial<NotificationPrefs>>(profile.notification_prefs);
    const mine = claimed.filter((n) => {
      if (n.user_id !== profile.id) return false;
      // Already seen in the portal (e.g. a chat they were reading): no email needed.
      if (n.read_at) return false;
      const pref = PREF_FOR_TYPE[n.type];
      return !pref || prefs[pref] !== false;
    });
    if (!mine.length) continue;

    if (mine.length === 1) {
      const n = mine[0];
      const { html, text } = renderEmail({
        heading: n.title,
        preheader: n.body ?? undefined,
        paragraphs: n.body ? [n.body] : [],
        cta: n.link ? { label: CTA_FOR_TYPE[n.type] ?? `Open in ${APP_NAME}`, url: `${SITE_URL}${n.link}` } : undefined,
      });
      await sendEmail({ to: profile.email, subject: n.title, html, text });
    } else {
      const { html, text } = renderEmail({
        heading: `${mine.length} updates in ${APP_NAME}`,
        preheader: mine.map((n) => n.title).join(" · "),
        paragraphs: mine.map((n) => `• ${n.title}`),
        cta: { label: "Open notifications", url: `${SITE_URL}/notifications` },
      });
      await sendEmail({ to: profile.email, subject: `${mine.length} new updates`, html, text });
    }
  }
}
