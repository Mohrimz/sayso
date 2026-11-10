# Sayso handbook

How everything works, for people running or changing the code. For the short introduction, see the [README](../README.md).

**Sayso: nothing goes live without your say-so.** One shared workspace where the agency plans, creates and tracks social media work, and each client logs in to follow progress, comment and approve content before it's published.

This is **Phase 1 (MVP)** of the product spec: the approval loop, monthly plans, tasks, brand kits, invites and email notifications, plus **real-time chat** between each client and the agency team.

**Stack:** Next.js 16 (App Router, Cache Components) · Supabase (Postgres with row-level security, Auth, Storage, Realtime) · Cloudflare Email Service or Resend for email · Tailwind CSS 4.

---

## Run it locally

Requirements: Node 20+, Docker Desktop (running).

```bash
npm install
npm run db:start      # starts local Supabase (first run downloads images)
npm run db:reset      # applies the schema and the two local logins
npm run dev           # http://localhost:3000
```

`.env.local` already holds the standard local Supabase keys. Copy `.env.example` for any other environment.

### Local logins (password `password123`, local only)

| Email | Role |
|---|---|
| admin@sayso.test | Agency admin (sees every client, publishes posts) |
| team@sayso.test | Agency team member (not an admin; assign clients from **Team → Assign clients**) |

There's no sample data. `db:reset` loads `supabase/seed.sql` (just these two logins) and then any `supabase/setup/*.sql` files. That folder is for your own clients' setup scripts and is git-ignored, so real client data never lands in the repository. To try approvals, add a client from the Dashboard, then invite an approver from its **Settings → People**.

**Email in development:** with `RESEND_API_KEY` empty, emails are printed to the dev server console instead of sent, and "Email me a link" shows the sign-in link on screen. Invite links can always be copied from the invite form.

**Email design:** every email goes through `renderEmail` in `lib/email.ts`. The headers are images: `public/brand/email-invite.jpg` for invitations and `email-header.jpg` for everything else. Each is art generated on Higgsfield with the real wordmark placed on top, so it looks the same in dark mode. Rebuild them if the wordmark changes. Invitations show as "<inviter> via Sayso", and replies go to the inviter.

**Fresh database:** to start with no one at all, empty `supabase/seed.sql`, run `npm run db:reset`, then open `/setup` to create the first agency admin.

---

## How it works

### Content workflow

```
Planned → Draft → Internal review → Client approves? → Approved → Scheduled → Published
            ↑            │                  │
            └─ fixes ────┘                  │
            └─────── changes requested ─────┘
```

The workflow is enforced **in the database** (`content_items_guard` trigger plus the `send_for_approval` and `submit_approval` functions). The app cannot mark content approved, skip internal review, or schedule unapproved content, even by mistake.

- **Who sends to the client:** only agency admins. A team member uses **Send for review**, which notifies the admin picked under "Checked by", or every admin if none is picked. The admin then sends the post to the client or sends it back with fixes. Admins also decide when the client sees a month: **Share with client** or **Hide from client**. Team members can still close and reopen a month the client already sees. The database enforces both rules (`content_items_send_guard` and `monthly_plans_share_guard`, migration `…_send_to_client_admins_only.sql`).
- **Deleting a post:** anyone on the agency team can delete a post at any stage until it's published: in progress, waiting for the client, or ready. Published posts can't be deleted (RLS policy "agency deletes content", migration `…_delete_unpublished_posts.sql`). The post's files are removed from storage, except work submitted on tasks, which stays in the task's history. Notifications that pointed at the post are removed too.
- **Monthly plan Overview:** shows the package progress, themes and key dates, and the month's posts in three lists: **Ready** (approved or scheduled), **Needs approval** (with the client) and **In progress** (planned, draft or internal review). The plan page no longer has a To-dos tab. Tasks live on the Tasks page.
- **Versions:** every media upload creates a new version. The version a client sees is frozen when it's sent for approval, and every approval records which version it was for (the audit trail).
- **Approval rules:** each workspace is set to "one approver is enough" or "every approver must approve". Tags such as `AI-generated` can force every-approver sign-off for that item.
- **Revision counter:** each change request uses one of the package's included revision rounds.
- **Clients never see** internal notes, internal review decisions, internal tasks, unshared months, unsent versions, team-only chats or other clients' workspaces. All of this is enforced by row-level security (`supabase/migrations/`), not by hiding things in the UI.
- **New content form:** title, type, month, a **date** to go live (stored at 09:00 in the client's time zone), caption and "More options". It doesn't ask for platforms: new posts are set for **Instagram and Facebook**, and editing a post keeps the platforms and link it already has.

### Task review

```
To do → In progress → In review → Done
                ↑          │
                └─ changes requested
```

- **Submitting:** a team member moves their agency task to **In progress**, then uses **Submit work**: they pick the post the work is for (one that's still planned, in draft or in internal review), upload their files and add an optional note.
  - **New post:** if the post isn't in the plan yet, they can make it right there. It's selected automatically when the client has no posts in progress.
  - **Pre-filled:** the title comes from the task, and the type is guessed from it ("Carousels" → Carousel). The date is optional.
  - **Where it goes:** it's added to the plan for its month (`createPostForTask`). If that month has no plan, an internal draft plan is created for it.
- **Reviewing:** agency admins get a notification and email. The link opens the review on the Team board (`/tasks?review=<task>`).
- **Mark done** adds the files to that post as its next version, as if they'd been uploaded on the post, and completes the task.
- **Request changes** needs a note. The task goes back to **In progress**, and the note shows on it until the next submission.
- **Who does what:**
  - Only the person a task is assigned to can submit work for it (anyone on the team when it's unassigned).
  - Only agency admins can delete tasks (policy "agency admins delete tasks", migration `…_task_permissions.sql`).
  - Admins see work waiting for them as **Submitted work**; the team sees it as **In review**.
- **Rules:** only agency admins can mark agency tasks done or move them out of review. The `tasks_review_guard` trigger enforces this in the database; `submit_task_work` and `review_task_work` are the only way through.
- **History:** every round is kept in `task_submissions` (migrations `…_task_status_in_review.sql`, `…_task_review.sql`).
- **Client tasks:** to-dos for the client are unchanged; they tick them off themselves.

### Chat

Each client workspace has two conversations (`supabase/migrations/…_chat.sql`, `components/chat/`):

- **Client chat** (`/w/<client>/chat`): the client's approvers and viewers plus the agency team on that client. For questions that aren't about one post; feedback on a post still belongs in that post's comments.
- **Team only** (`/w/<client>/chat/team`): agency only, for talking about the client privately. Clients get a 404, and the database never returns those messages to them.
- **Inbox** (`/inbox`, agency): every client chat in one place, unread first.

How it behaves:

- **Live:** messages, deletions and "Seen by" arrive over Supabase Realtime; typing indicators and "here now" use a private Realtime channel that only people in the conversation can join. After a dropped connection or a sleeping tab, missed messages are fetched automatically.
- **Files:** photos, videos and documents up to 50 MB (10 per message). Pick, paste or drag them in; they upload straight to the private `chat-files` bucket while you type.
- **Unread:** each person has a "read up to" marker per conversation. Badges on the Chat item, the client list and the Inbox update live.
- **Notifications:** at most one unread notification (and one email) per conversation. Later messages update it instead of adding more, and people who were reading the chat in the last two minutes aren't notified at all. Each person can turn chat emails off in Account. Every agency admin is notified about every chat, along with the team members assigned to that client (migration `…_chat_notify_admins.sql`). On a computer the chat fills the whole area to the right of the sidebar.
- **Post preview:** a post shows its photos and videos exactly as uploaded, with nothing cropped, and the file size and shape underneath (for example "1080 × 1350 · 4:5"). With several files, move between them with the arrows, by clicking the left or right side of the photo, by swiping, with the dots, or with the arrow keys. The caption and hashtags sit below (`components/post-preview.tsx`). While a post is still in progress (planned, draft or internal review), the agency team can change the order of its photos there: drag a numbered thumbnail, or use **Move earlier**, **Move later** and **Make first**. They can also type the caption and hashtags straight into the box under the preview and press **Save caption** (Ctrl+Enter also saves). If the latest version was already sent to the client, a new order is saved as a new version (`reorder_post_media()`, migration `…_reorder_post_media.sql`).
- **Reactions:** hover a message and press the smiley to pick 👍 ❤️ 😂 😮 😢 or 🙏. Reactions show as chips under the message with a count; hover a chip to see who reacted, click it to add or remove yours. Everyone in the chat sees them live. Stored in `messages.reactions` and changed only through `toggle_reaction()` (migration `…_chat_reactions.sql`).
- **Edit:** the author can change the text of their own message from its ⋯ menu (Enter saves, Esc cancels). Edited messages are marked "edited", everyone sees the new text live, and notification previews follow it. Files, replies and reactions stay as they are. Stored through `edit_message()` with `messages.edited_at` (migration `…_chat_edit_message.sql`).
- **Photos and videos:** a photo in a message opens full size when clicked, with arrows when the message has several, and closes with ✕, Esc or a click outside. Every photo and video has a download button (on the thumbnail and in the full-size view) that saves the original file.
- **Reply:** hover a message and press the reply arrow (or use its ⋯ menu), then send. The reply shows a small quote of the original; clicking the quote jumps to it. If the original is deleted, the quote reads "Message deleted". Stored as `messages.reply_to` (migration `…_chat_replies.sql`); the database drops a reply target from another conversation.
- **Delete:** authors (and agency admins) can delete a message for everyone. Its files are removed, and its text is scrubbed from notification previews.
- **Safety:** the database fills in the author and timestamp itself, so nobody can post as someone else or backdate a message, and a message can only attach files from its own conversation's folder.

### Sign-in welcome

Every sign-in passes through `/arrive?kind=back|new&to=<page>`: password sign-in, email links, invites and the first-admin setup (`arrivalUrl()` in `lib/arrival.ts`). It plays a short welcome on a dark ember background:

- The "sayso" wordmark is traced in and filled, the ember seal springs in under the tick, and a ripple runs out from it.
- Then the greeting appears: "Welcome back, Name", or "Welcome to Sayso, Name" for invites and setup.
- The overlay (`components/arrival/arrival.tsx`, mounted once in `components/providers.tsx`) stays on screen while the destination page loads underneath, then opens with an iris to reveal it. First-time arrivals end with confetti.
- About 1 second for returning people (longer for first-timers). Tap, Esc or Enter skips it.
- With "reduce motion" switched on, it shows a still logo and greeting briefly and fades.
- It never plays on normal navigation.

**Signing out** plays the reverse: the ember screen closes in over the app, the seal and its tick wave, and "See you soon, Name" appears. Then it fades away on the login page.

- It's used by the account menu, the phone **More** sheet and Account → **Sign out everywhere**, through `useSignOut()` and `<SignOutForm>` in the same file.
- The sign-out request starts straight away, and the animation only covers the wait, so it can never hold up or block signing out. If signing out hasn't finished after 8 seconds, the screen gets out of the way and shows an error.

Invited people then land on `/welcome`: an on-brand header with their name, three "how it works" steps (for clients or for the agency), and the confirm-your-details form.

**@mentions in chat:** type `@` (or press the @ button) to pick someone in that conversation. The message keeps plain "@Name" text, and `messages.mentions` stores who was tagged. The database keeps only people who can read that chat (migration `…_chat_mentions.sql`). Each person mentioned gets a "mentioned you" notification instead of the general "new message" one, emailed according to their chat-message email setting. Their name is highlighted in the message, and opening the chat clears both kinds of notification. Tapping an @Name opens a small profile card (photo, name, job title, agency or client, and whether they are in the chat now). Agency admins also get **View profile**, which goes to `/people/[id]`. The card is `components/chat/mention-profile.tsx`.

### Account and profile

Everyone manages their own account at `/account` (`components/account/`, `app/actions/account.ts`):

- **Profile:** name, job title, phone number and a profile picture. Pictures are framed in the browser (drag to move, slider or scroll to zoom) and saved as a 400×400 JPEG in the public `avatars` bucket, under a random file name in the person's own folder. Replacing or removing a picture deletes the old file. Photos show in the sidebar, chat, comments and people lists. Job titles and phone numbers show in the client's People list and the agency Team page.
- **Email address:** changing it sends a confirmation link to the new address (and a heads-up to the old one). Nothing changes until the link is clicked. Links are signed, last 24 hours, and stop working once the email has changed (`lib/email-change.ts`, `app/auth/change-email`).
- **Password and sign-in:** set a password (optional), or sign out on every device. Other devices drop off within the hour, when their sign-in token expires.
- **Delete account:** after typing their email address to confirm, people can permanently delete their own account. Their comments, approvals and messages stay, shown as "Former member", so the record of what was agreed survives. The agency's only admin can't delete their account, and a client's only approver is warned first.

### File storage (Cloudflare R2)

Post media, Library files, chat attachments and profile pictures all go through `lib/files.ts`. Logins and the database stay on Supabase.

- **Where files go:** **Cloudflare R2** when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` are set, otherwise Supabase Storage. Objects in R2 are named `<R2_KEY_PREFIX><bucket>/<path>` (for example `content-media/<client>/<post>/…`), so the paths saved in the database are the same for both.
- **Uploads:** the browser asks `prepareUploads` (`app/actions/files.ts`) for a link. That action checks who may upload where, the way the old storage rules did: post media is agency only, Library files are the agency and approvers, chat files are people in that chat, and profile pictures go in your own folder. The browser then sends the file straight to R2 with a 15-minute signed PUT link (`lib/upload.ts`).
- **Viewing and downloading:** the server hands out signed links (1 hour, 5 minutes for downloads, 12 hours in chat) only for files the person can already see through row-level security. Profile pictures go through `/avatars/<user>/<file>`, which redirects to a signed link and is cached for a day.
- **Publishing:** R2 links are reachable from the internet, so "Publish now" also works when Sayso runs on your own computer.
- **Setting up R2:** create a bucket (for example `sayso-files`, region Asia-Pacific) and an API token with **Object Read & Write** on it. Add a CORS rule allowing GET, PUT and HEAD with the `content-type` header from the site and http://localhost:3000. Then set the four variables, plus `R2_KEY_PREFIX=dev/` in `.env.local` to keep local files apart.
- **Moving existing files:** run `node --env-file=.env.production.local scripts/copy-files-to-r2.mjs` (add `--dry-run` to only count them). It copies every Supabase file to R2 under the same name, skips files already there, and can be run again safely. `npm run files:to-r2` does the same locally.

### Library

Each client has a **Library** (`/w/<client>/library`): its product photos, videos, logos and documents in one place.

- **Files tab:** a photo and video grid with filters (All, Photos, Videos, Documents), folders and search by name. Click a file to preview it large and download it with its own name. Only agency admins can rename, move, add a note to or delete a file; this is enforced in the database (migration `…_library_admins_edit.sql`).
- **Downloading several files:** everyone can press **Download all** (everything in the current view) or **Select** to tick files and download just those. Several files come as one ZIP, organised by folder and built in the browser from the files' own links (`client-zip`). Very large ZIPs are written straight to disk in Chrome and Edge.
- **Uploading:** the agency team and client approvers press **Upload files**, drop in up to 50 files (500 MB each) and pick or type a folder. Viewers can browse and download only. When a client uploads, the agency admins and that client's team members get a notification.
- **From posts tab:** every photo and video used in the client's posts, each linking to its post. Clients only see versions that were sent to them.
- **Brand kit:** its logos card shows the Library's "Brand" folder. Files uploaded to the Brand kit before the Library existed were moved into that folder by the migration.
- **How it's stored:** files go in the private `workspace-files` bucket under `<client>/library/<random>/<file>`. The `assets` table (migration `…_library.sql`) holds the name, folder, type, size, note and uploader. Row-level security: members can see files, the agency team and approvers can add them, and only agency admins can change or delete them.

### Offers

Each client has an **Offers** page (`/w/<client>/offers`). The client tells the agency about a sale, a discount or a launch there, in their own words, so the team can plan posts around it.

- **Sharing an offer:** only the client side (approvers and viewers) can post. It's one text box, like an announcement, with no dates, codes or files. Posts can't be edited; the person who posted one can remove it. The agency team can't post offers; they read them and act.
- **Who's told:** the agency admins and that client's team members get a notification and an email, linking straight to the offer. Agency staff can turn the email off with **New client offers** on the Account page.
- **The page:** clients see the text box and everything shared so far, newest first. The agency team sees the list, with **Plan a post** on each.
- **Elsewhere:** a client's Overview/Home shows the 3 latest offers from the last month. The agency Dashboard's **Client offers** card shows the latest from every client in the last month. Sayso includes recent offers in the daily briefing and in a client's profile.
- **How it's stored:** the `offers` table: message, author and time (migrations `…_offers.sql` and `…_offers_announcements.sql`). Row-level security: members can see offers, only client members can add them, only the author can remove one, and nobody can edit.

### Profile reminders for clients

Clients whose profile is missing their name, job title, phone number or photo get a **"Complete your profile"** notification. It lists what's missing and links to the Account page, which shows a "Finish your profile" checklist. It's sent when they're added to a client, and was sent once to everyone already there when the feature was added. As soon as the last detail is filled in, the reminder is marked read and **"Your profile is complete"** arrives in the bell, live. Both are in-app only (no email). It all happens in the database (migration `…_profile_nudges.sql`: `nudge_profile()`, triggers on `workspace_members` and `profiles`), so it works however the profile is edited.

### Client logins and first sign-in

When you don't have a client's email address yet, make them a login and send it to them privately:

```
node --env-file=.env.production.local scripts/create-client-login.mjs <client-slug> <name>@sayso.mohrimz.com [approver|viewer]
```

It prints a password once. Addresses `@sayso.mohrimz.com` are placeholders (`lib/placeholder-email.ts`): nothing is ever emailed to them, and the login page tells people with one to use the Password tab.

**First sign-in setup.** Every new client (invited or given a login) gets a short setup over the app until it's finished (`components/onboarding/`, `profiles.onboarded_at`, migration `…_client_onboarding.sql`):

1. Their name, job title and phone number.
2. A profile photo (required).
3. Placeholder logins only: their own email address, confirmed by a link, and a new password that replaces the one you sent. Until they click the link, they sign in with the placeholder and their new password.
4. An offer of a walkthrough.

Finishing setup completes their profile, so "Your profile is complete" arrives in the bell.

**Walkthrough.** It opens each page of their workspace in turn (Home, Monthly plan, Chat, Action items, Brand kit, Library, Offers, Team & package), with a short card saying what the page is for. The page's sidebar link is ringed while it's shown. Progress is just `?tour=N` in the address. Clients can take it again from the Account page.

People who were already using Sayso when this was added count as set up, and agency staff never see it.

### Cookie consent

A small card in the bottom-right corner (along the bottom on phones) asks people to accept cookies. It doesn't block the page, but signing in (password, email link or first-run setup) is refused on the server until it's accepted (`components/cookie-consent.tsx`, `lib/consent.ts`).

- **The choice:** saved for 12 months in a `sayso_consent` cookie. Bump `CONSENT_VERSION` when the cookie list changes and everyone is asked again.
- **What's listed:** the card's "What we store" and the Privacy Policy's Cookies section both read `STORED_ITEMS` in `lib/consent.ts`, so they always match.
- **Withdrawing:** people can withdraw on the Account page, which also signs them out on that browser.
- **Automated tests:** they need to accept first. Click **Accept** on the card, or add a `sayso_consent` cookie with the value `v1.<ms timestamp>`.

### Instagram and Facebook: results and publishing

Both go through the agency's Make.com account (zone `eu1.make.com`). Meta's developer signup wasn't available, and Make's free plan costs nothing. The portal calls Make's "run scenario" API with `MAKE_API_TOKEN`.

- **Linking a client:** in a client's **Settings**, an admin picks its Instagram account and Facebook Page from `INSTAGRAM_ACCOUNTS` / `FACEBOOK_PAGES`. Each one also needs a Make connection authorized by someone who manages that Page.
- **Results** (`lib/post-results.ts`, scenario `MAKE_RESULTS_SCENARIO_ID`): a published post's page shows Instagram views, reach, likes, comments, shares and saves, read from the live link. It also shows Facebook reactions, comments and shares for the Page post closest in time. Numbers are saved in `post_insights`, refreshed in the background when they're stale (every 6 hours for new posts, then less often), and Refresh waits at least 15 minutes between lookups. Make's Facebook app can't read Page views or reach.
- **Publishing** (`lib/publish.ts`, `app/actions/publish.ts`, scenario `MAKE_PUBLISH_SCENARIO_ID`): once the client approves, an agency admin presses **Publish now**. The version the client approved goes out on the client's Instagram and Facebook with its approved caption and hashtags. The post is then marked Published with its live link, and results start coming in. Reels, single photos and carousels (up to 10) are supported. Stories aren't: post them by hand and use "Mark as published".
  - Instagram and Facebook download the files themselves, so publishing only works on the live site. Locally, the button explains that instead. Instagram only takes JPG photos this way.
  - If one platform fails, the other still counts and the message says what to do. Nothing is retried automatically, so a post can't go out twice.
- **Admins only:** going live is restricted to agency admins in the database (`content_items_publish_guard`, migration `…_publish_admins_only.sql`), not just in the UI. Team members press **Request publishing** instead, which notifies every admin in the portal and by email. A reminder can be sent an hour later. A published post can't be moved back from the portal.

### Roles

| | Agency admin | Team member | Client approver | Client viewer |
|---|---|---|---|---|
| Manage client workspaces | ✓ | | | |
| Invite users | ✓ | | own team | |
| Plans, content, tasks | ✓ | assigned clients | | |
| See plans, timeline, progress | ✓ | assigned clients | ✓ | ✓ |
| Comment | ✓ | ✓ | ✓ | ✓ |
| Client chat (send messages and files) | ✓ | assigned clients | ✓ | ✓ |
| Team-only chat, Inbox | ✓ | assigned clients | | |
| Delete a chat message | anyone's | own | own | own |
| Edit own profile, photo, email; delete own account | ✓ (unless the only admin) | ✓ | ✓ | ✓ |
| Approve / request changes | | | ✓ | |
| Publish an approved post ("Publish now", "Mark as published") | ✓ | asks an admin ("Request publishing") | | |
| Remove people (Team page, or a client's People list) | anyone | | own client team | |
| Upload brand files | ✓ | ✓ | ✓ | |
| Internal notes and review | ✓ | ✓ | | |
| Billing and package | ✓ | | ✓ | |

**Last seen and profiles:**
- **Team page:** each person shows "Active now" (used Sayso in the last 5 minutes) or "Last seen 2h ago", with the exact time in Sri Lanka time on hover. People who have never used it show "Hasn't signed in yet". Below the agency team, a **Clients** list shows everyone on the client side, most recently active first. Each person has a "Client" badge, their client and role (linking to that client's Team & package page), "(temporary login)" for `@sayso.mohrimz.com` logins, and "Setup not finished" if they've signed in but not completed their first sign-in setup.
- **Where it comes from:** while Sayso is open, the app calls `touch_last_seen()` (migration `…_last_seen.sql`) when the page opens, when the tab comes back into view, and every 2 minutes. The database records its own clock and writes at most once every 2 minutes per person. The time sits in `user_activity`, which only agency admins and the person themselves can read.
- **Profiles:** click a name on the Team page, or in a client's People list (admins only), to open `/people/<id>`. It shows the photo, job title, role, last seen, email, phone, join date, last sign-in, and the clients they belong to with their role in each.

**Removing people:**
- **Team page:** each teammate has a **Remove** button with a confirmation step. It deletes their login, so they can't sign in again. Their past posts, comments and messages stay, credited to "Former member".
- **A client's Settings → People:** **Remove** takes someone off that client. A client who has no other client left loses their login too. Agency team members only stop seeing that client.
- **Sign-in links:** asking for a sign-in link with an email that isn't part of Sayso shows "isn't part of Sayso" instead of sending anything. The agency chose this over hiding whether an account exists.

**Assigning clients:** on the **Team** page, each team member has an **Assign clients** button (it shows **Clients · N** once some are assigned). It opens a panel listing every client; tick the ones they work on and save. A client's **Settings → People** still works for one client at a time. Admins always see every client.

### Project layout

```
app/
  (app)/dashboard            agency overview across clients
  (app)/tasks                team board across clients
  (app)/team                 agency users (admins)
  (app)/clients/new          create a client workspace
  (app)/inbox                every client chat (agency)
  (app)/w/[slug]             client workspace: home, plan/[month], content/[id],
                             content/new, chat, chat/team, tasks, brand, settings
  actions/                   server actions (every mutation re-checks access)
  auth/confirm               verifies invite and sign-in links
  auth/change-email          applies a confirmed email change
  (app)/account              profile, picture, email, password, delete account
  login, setup               sign in; first-run admin setup
components/                  UI (phone preview, calendar, approval panel, etc.)
lib/                         Supabase clients, auth, permissions, dates, UTM builder, email
supabase/migrations/         schema, row-level security, workflow, storage, realtime
supabase/seed.sql            demo data
```

Useful scripts: `npm run db:types` regenerates `lib/database.types.ts` after schema changes, and `npm run typecheck` checks types.

### Name, navigation and page guides

- **Name and tagline:** `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_APP_TAGLINE` (defaults: Sayso, "Nothing goes live without your say-so."). The colour lives in `--color-accent` in `app/globals.css`, and the logo in `components/logo.tsx` and `app/icon.svg`.
- **Times:** every clock time is shown in US Pacific time first (PT, where the clients' audiences are) and then Sri Lanka time (LK, where the agency works), for example "Mon 9 Nov, 19:30 PT · Tue 10 Nov, 09:00 LK". A client in another time zone gets theirs as a third. It's one place in the code: `formatDateTime` and `formatTime` in `lib/dates.ts` (`US_TIME_ZONE`, `AGENCY_TIME_ZONE`). The calendar still places posts on days in the client's own time zone.
- **Navigation:** a left sidebar on desktop (descriptions appear as tooltips), a top bar with the breadcrumb, a **Help** button and notifications; on phones, a slide-out menu plus a bottom tab bar inside a client workspace (`components/shell/`).
- **Page help:** nothing is shown automatically. The Help button opens a short guide for the current page, worded for the reader's role. All of this text, and the sidebar tooltips, lives in `lib/insights.ts`; register new pages in `routeFor()` there.
- **UI libraries:** [Motion](https://motion.dev) for animation (page transitions, staggered lists, progress bars, the sliding nav highlight), [Radix UI](https://www.radix-ui.com) for accessible menus, tabs, tooltips, popovers and slide-in panels, [Sonner](https://sonner.emilkowal.ski) for toast confirmations, and `canvas-confetti` for the approval celebration. Animations respect the "reduce motion" system setting.

---

## Deploying

Deploys run from the command line with `vercel deploy --prod` (the project is linked via `.vercel/`); environment variables are managed with `vercel env`.

Production keys and the database password live in `.env.production.local`, which is git-ignored. Apply new migrations with:

```bash
# PowerShell: load the DB password from .env.production.local first
$env:SUPABASE_DB_PASSWORD = ((Get-Content .env.production.local | Select-String '^SUPABASE_DB_PASSWORD=').Line -split '=', 2)[1]
npx supabase db push        # migrations only; never push seed.sql to the cloud
```

To set up from scratch on another project:

1. **Supabase project:** create one and run `npx supabase link --project-ref <ref>`, then `npx supabase db push` to apply the migrations (don't push the seed).
   Under **Realtime → Settings**, leave public channels allowed: live updates use public channels (still filtered by row-level security), and chat typing indicators use private ones.
   In **Authentication → Sign In / Providers**, turn off "Allow new users to sign up" (the portal is invite-only). Under **URL Configuration**, set the Site URL to your domain.
2. **Email:** the app sends invites, sign-in links and notifications itself, so Supabase's built-in email isn't used. Set up one service:
   - **Cloudflare Email Service:** the domain's DNS must be on Cloudflare, sending must be enabled for the domain, and the account needs the Workers Paid plan to email arbitrary recipients. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_EMAIL_API_TOKEN` (an API token allowed to send email). If these are set, Cloudflare takes priority.
   - **Resend:** verify your sending domain at resend.com and set `RESEND_API_KEY`.
   - **Gmail (no domain needed):** set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` (the Gmail address) and `SMTP_PASS` (an app password from myaccount.google.com/apppasswords; requires 2-Step Verification). Emails come from that Gmail address, up to about 500 a day. Any other SMTP server works the same way.
   - With Resend or Cloudflare, set `EMAIL_FROM` to an address on the verified domain, e.g. `Sayso <hello@youragency.com>`. With Gmail it defaults to `Sayso <your Gmail address>`.
3. **Vercel:** import the repo with root directory `client-portal`, and set the environment variables from `.env.example` using your production values. Email-change links are signed with `SUPABASE_SECRET_KEY`. Set `EMAIL_CHANGE_SECRET` to use a separate key; changing either one cancels any links already sent.
4. Open `/setup` on the live site to create the first agency admin.
5. **Claude (optional):** to turn on AI features, create an API key in the Claude Console (platform.claude.com, under **API keys**) and add credits under **Billing**. Then set `ANTHROPIC_API_KEY`. The steps below are for this project.
6. **Instagram and Facebook (optional):** set `MAKE_API_TOKEN`, `MAKE_ZONE`, `MAKE_RESULTS_SCENARIO_ID`, `MAKE_PUBLISH_SCENARIO_ID`, `INSTAGRAM_ACCOUNTS` and `FACEBOOK_PAGES` (see `.env.example`). Client setup scripts in `supabase/setup/` can be run against the cloud project with `npx supabase db query --remote -f <file>`.

### Claude (Anthropic API)

Server code calls Claude through `askClaude()` in `lib/claude.ts` (model `claude-opus-5-5`). It returns `{ ok, text }` or `{ ok: false, error }` and never throws, and `claudeConfigured()` lets a feature hide itself when no key is set. The key is server-only and must never get a `NEXT_PUBLIC_` prefix.

1. Paste the Console key after `ANTHROPIC_API_KEY=` in `.env.local` (and in `.env.production.local` if you use the same key for production), then run `npm run claude:check`. It sends one tiny request and prints Claude's reply.
2. Add the key to Vercel as a sensitive variable. In PowerShell:

   ```powershell
   ((Get-Content .env.production.local | Select-String '^ANTHROPIC_API_KEY=').Line -split '=', 2)[1] | vercel env add ANTHROPIC_API_KEY --environment 'production,preview' --sensitive
   ```

3. Redeploy so the live site picks it up.

For a separate bill and spend limit, create a "Sayso" workspace in the Console and make the key there.

### Sayso, the team assistant

**Sayso** is a chat where agency staff ask things like "What's the update for today?" and Claude answers from live portal data. An **Ask Sayso** button sits in the bottom-right corner of every agency page (`components/assistant/sayso-launcher.tsx`, mounted in `app/(app)/layout.tsx`); it's hidden in chat pages so it doesn't cover the message box. On phones and tablets it sits above the app's bottom tab bar, and staff can also open Sayso from the **More** tab. It opens a pop-up (full screen on phones), and the expand button opens the same chat full screen at `/assistant?chat=<id>`, with saved chats alongside. The full page uses `ChatFrame`, so it fits between the top bar and the tab bar like the chat pages. Checked at foldable sizes (382, 385, 669×867, 951×620), phone, tablet and desktop. Clients never see it: the button, the page, the chat actions and `POST /api/assistant` all require an agency account.

- **Saved chats:** every conversation is stored in `assistant_chats` (migration `…_assistant_chats.sql`): the full Claude transcript, plus which model answered each turn. Row-level security makes each chat visible only to the person who had it, even to admins. Chats are listed newest first, can be reopened or deleted, and are removed when the person's account is deleted. The browser only remembers which chat was open last (`localStorage` key `sayso:current-chat:<user id>`), so the pop-up and full screen pick up the same conversation.

- **What it can see:** read-only tools in `lib/assistant/tools.ts` (daily briefing, clients, content search, post details, tasks, recent activity, client profile). They query through the signed-in person's Supabase session, so row-level security limits answers to the clients that person can open. It can't change anything; it links to the page where the person can make the change.
- **Which model answers (Auto):** in Auto mode, `lib/assistant/models.ts` picks the cheapest model that suits each question. A tiny Claude Haiku 5.5 call sorts the question into "quick" (find and list facts: today's update, what's overdue, what a client said) or "deep" (judgment: risks, priorities, comparisons, writing). Quick questions are answered by **Claude Haiku 5.5** (about $0.001 each); deep ones by **Claude Opus 5.5** (about $0.05–0.10 each). The starter questions skip the sorting call. If sorting fails, the question goes to Opus. Each answer shows which model answered it and the estimated cost, and quick answers have a **Go deeper** button that asks again with Opus. Prices and effort levels are in `TIERS`.
- **How it runs:** `lib/assistant/run.ts` streams the answer (effort `low`, up to 8 lookup rounds) as newline-delimited JSON, and logs each answer's tier and estimated cost to the server log. The server loads the saved transcript, replays it unchanged (including Claude's saved reasoning and tool results), and saves it again once the answer is complete; a stopped or failed answer isn't saved. The system prompt stays fixed and the current time travels in each question, so earlier turns stay valid and the prompt cache keeps working.
- **Allowance:** each agency **team member** can spend up to **$2 per 24 hours** on Sayso (`SAYSO_LIMIT_USD`). The 24 hours start with their first question, and the first question after they end starts a new period. **Agency admins have no limit**, though their use is still recorded. Spending is recorded per person per period in `assistant_usage` (migration `…_assistant_usage.sql`). People can read their own total but can't change or delete it: only the server adds to it, through `add_assistant_usage`, which only the service role can call. Deleting chats doesn't reset it, and a stopped or failed question still counts what it used. Logic is in `lib/assistant/allowance.ts`.
  - **At the limit:** Sayso refuses new questions (HTTP 429), and the chat shows when the period renews. Saved chats stay readable.
  - **Near the limit:** with less than $0.25 left, questions go to the quick model, and a question already running stops making new lookups once the limit is crossed. So a last question can go a few cents over, but no further.
  - **In the chat:** a credits meter above the conversation shows team members what's left, as an amount and a bar, and when it renews. Admins see "No credit limit".
- **Model picker:** a menu in the message box lets each person choose **Quick** (Claude Haiku 5.5, about $0.001 a question, the default), **Auto** (Sayso picks Quick or Deep for each question), or **Deep** (Claude Opus 5.5, about $0.08). Each option shows roughly how many questions the remaining credits buy, and Deep is disabled when less than $0.25 is left. The choice is remembered per person in this browser (`localStorage` key `sayso:model:<user id>`). **Go deeper** on an answer always uses Deep. Typical costs are in `TYPICAL_COST` in `lib/assistant/shared.ts`.
- **Cost tuning:** to save more, send everything to Haiku by changing `TIERS.deep` to Haiku. For better quick answers, raise `TIERS.quick.effort` to `"medium"`. Both levers are in `lib/assistant/models.ts`.
- **No key:** without `ANTHROPIC_API_KEY` the page shows a short "not set up" notice.

---

## Defaults chosen for the spec's open questions

| Question | Default in this build | Where to change |
|---|---|---|
| Portal name / domain | `NEXT_PUBLIC_APP_NAME` env var; domain set at deploy | env |
| One approver or all by default? | One approver; configurable per client, plus tag rules | Client settings |
| When an approval deadline passes | The item is flagged overdue (red) on both sides; nothing moves automatically | Reminders come in Phase 2 |
| Billing view | Shows the scope, fee and contract only, no invoices | `packages` table |
| Branded client login | Not yet | |
| File retention after a client leaves | Workspace can be archived; nothing is deleted automatically | |
| Time tracking beyond community management | Not yet | |

## Next (Phase 2)

Monthly reports with PDF export · asset library with "cleared for use" flags · community management log · pinned comments on images and video · approval reminders, digests and bulk approval.
