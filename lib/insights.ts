/**
 * All explanatory copy in one place: the one-line descriptions under each
 * sidebar item, and the "About this page" guide shown at the top of each page.
 * Text is tailored to the reader's role.
 */
import type { WorkspaceRole } from "@/lib/permissions";

export type Audience = WorkspaceRole | "agency";
export type Insight = { id: string; title: string; summary: string; points: [string, string][] };

const isAgency = (a: Audience) => a === "admin" || a === "team_member" || a === "agency";

/** Which page a path is, for the breadcrumb and the Help button. */
export function routeFor(pathname: string, audience: Audience): { key: string; label: string } | null {
  const agency = isAgency(audience);
  const fixed: Record<string, { key: string; label: string }> = {
    "/dashboard": { key: "dashboard", label: "Dashboard" },
    "/assistant": { key: "assistant", label: "Sayso" },
    "/inbox": { key: "inbox", label: "Inbox" },
    "/tasks": { key: "board", label: "Team board" },
    "/team": { key: "team", label: "Team" },
    "/clients/new": { key: "new-client", label: "New client" },
    "/notifications": { key: "notifications", label: "Notifications" },
    "/account": { key: "account", label: "Account" },
  };
  if (fixed[pathname]) return fixed[pathname];
  if (pathname.startsWith("/people/")) return { key: "team", label: "Profile" };
  const match = /^\/w\/[^/]+(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const rest = match[1] ?? "";
  if (rest === "" || rest === "/") return { key: "home", label: agency ? "Overview" : "Home" };
  if (rest.startsWith("/plan")) return { key: "plan", label: "Monthly plan" };
  if (rest.startsWith("/chat")) return { key: "chat", label: rest.startsWith("/chat/team") ? "Team chat" : "Chat" };
  if (rest === "/content/new") return { key: "new-content", label: "New content" };
  if (rest.startsWith("/content/")) return { key: "content", label: agency ? "Content" : "Review post" };
  if (rest.startsWith("/tasks")) return { key: "tasks", label: agency ? "Tasks" : "Action items" };
  if (rest.startsWith("/brand")) return { key: "brand", label: "Brand kit" };
  if (rest.startsWith("/library")) return { key: "library", label: "Library" };
  if (rest.startsWith("/offers")) return { key: "offers", label: "Offers" };
  if (rest.startsWith("/settings"))
    return { key: "settings", label: audience === "admin" ? "Settings" : agency ? "Client profile" : "Team & package" };
  return null;
}

/** Short descriptions shown as tooltips on sidebar items. */
export function navHint(key: string, audience: Audience): string {
  const agency = isAgency(audience);
  switch (key) {
    case "dashboard":
      return "All clients and your work queue";
    case "assistant":
      return "Your team assistant";
    case "board":
      return "Every task, across all clients";
    case "team":
      return "Staff, clients and last seen";
    case "new-client":
      return "Set up a new client workspace";
    case "home":
      return agency ? "Approvals, changes and progress" : "What needs you right now";
    case "plan":
      return agency ? "Calendar, quotas and updates" : "This month's posts and dates";
    case "new-content":
      return "Plan a post, reel or story";
    case "tasks":
      return agency ? "Non-post work and client to-dos" : "Things the team needs from you";
    case "brand":
      return "Logos, colours, tone and FAQs";
    case "library":
      return "Product photos, videos and files";
    case "offers":
      return agency ? "Offers the client shared with you" : "Tell the team about sales and discounts";
    case "settings":
      if (audience === "admin") return "Package, rules and people";
      if (agency) return "Goals, rules and quotas";
      return "Your package and team access";
    case "inbox":
      return "Every client chat in one place";
    case "chat":
      return agency ? "Message the client or your team" : "Message the agency team";
    case "notifications":
      return agency ? "Approvals, changes and comments" : "Posts to approve and replies";
    case "account":
      return "Name, password and emails";
    default:
      return "";
  }
}

export function insightFor(key: string, audience: Audience): Insight {
  const agency = isAgency(audience);
  switch (key) {
    case "dashboard":
      return {
        id: "dashboard",
        title: "Your agency at a glance",
        summary: "Start here each day. It shows every client you look after, how far each one is through this month's package, and the work waiting on you.",
        points: [
          ["Your queue", "content assigned to you. Admins also see posts waiting for their review."],
          ["Change requests", "posts a client sent back with notes."],
          ["Awaiting clients", "posts sent for approval, and how many are past their deadline."],
          ["Clients", "click any client to open their workspace."],
        ],
      };
    case "assistant":
      return {
        id: "assistant",
        title: "Ask Sayso",
        summary: "Sayso is your team assistant. Ask in plain words, such as \"What's the update for today?\", and it answers from live portal data. Open it from the button in the bottom-right corner of any page. Only the agency team can use it.",
        points: [
          ["What it sees", "the same clients, posts, tasks and chats you can open. Nothing more."],
          ["Read-only", "it can't approve, edit or send anything. It links you to the right page instead."],
          ["Saved chats", "every conversation is saved to your account, and only you can see it. Reopen or delete one from the list."],
          ["Go deeper", "simple questions get a quick, low-cost answer. Press Go deeper for a more thorough one."],
        ],
      };
    case "board":
      return {
        id: "board",
        title: "Every task, every client",
        summary: "Work that isn't a post, such as updating a bio or setting up highlights, grouped by status across all your clients.",
        points: [
          ["Filters", "show only your tasks, or one client's."],
          ["Status", "change it from the dropdown on each task."],
          ["Adding tasks", "do it from a client's Tasks page so it's linked to them."],
          ["Internal tasks", "are never shown to the client."],
        ],
      };
    case "team":
      return {
        id: "team",
        title: "Your team and clients",
        summary: "Invite staff, decide what they can see, and see when everyone last used Sayso.",
        points: [
          ["Admins", "see every client and manage settings and billing."],
          ["Team members", "only see the clients they're assigned to. Use Assign clients on their row."],
          ["Clients", "everyone on the client side, with their client, their role and when they were last active. “Setup not finished” means they signed in but haven't completed their first sign-in setup."],
          ["Last seen", "hover over the time to see exactly when, in US Pacific (PT) and Sri Lanka (LK) time."],
        ],
      };
    case "new-client":
      return {
        id: "new-client",
        title: "Add a client",
        summary: "Creates a private workspace for one client. Nothing in it is visible to anyone else.",
        points: [
          ["Quotas", "drive the deliverable counters each month."],
          ["Revision rounds", "how many change requests are included per post."],
          ["Approvals", "choose whether one approval is enough or every approver must sign off."],
          ["Next step", "invite the client's approvers and fill in the brand kit."],
        ],
      };
    case "inbox":
      return {
        id: "inbox",
        title: "Inbox",
        summary: "Every client conversation in one place. Chats with unread messages come first.",
        points: [
          ["Unread", "the number shows messages you haven't seen yet."],
          ["Team only", "private chats about a client. The client never sees them."],
          ["Reply", "open a chat to reply. Messages arrive live."],
          ["Email", "choose whether new messages are emailed to you in Account."],
        ],
      };
    case "chat":
      return agency
        ? {
            id: "chat-agency",
            title: "Chat",
            summary: "Talk to this client in real time, or with your team about them.",
            points: [
              ["Client chat", "the client's approvers and viewers see every message, and so does your team."],
              ["Team only", "a private chat about this client. The client never sees it."],
              ["Files", "attach photos, videos or documents up to 50 MB. You can also paste or drag them in."],
              ["Alerts", "people get one notification per unread chat, not one per message."],
            ],
          }
        : {
            id: "chat-client",
            title: "Chat with the team",
            summary: "Message the agency directly. Everyone in your team who uses the portal sees this conversation.",
            points: [
              ["Quick questions", "ask anything here. The team gets a notification."],
              ["About one post", "comment on the post itself so the feedback stays with it."],
              ["Files", "send photos, videos or documents by attaching, pasting or dragging them in."],
              ["Email", "you get one email when a new message arrives, then none until you've read it."],
            ],
          };
    case "notifications":
      return {
        id: "notifications",
        title: "Notifications",
        summary: "A record of everything that needed your attention. Tap one to go straight to it.",
        points: agency
          ? [
              ["Approvals", "when a client approves or requests changes."],
              ["Comments", "new comments on content you work on."],
              ["Tasks", "work assigned to you."],
              ["Email", "choose which of these are emailed in Account."],
            ]
          : [
              ["Ready for approval", "new posts waiting for you."],
              ["Replies", "comments from the team."],
              ["Action items", "things the team needs from you."],
              ["Email", "choose which of these are emailed in Account."],
            ],
      };
    case "account":
      return {
        id: "account",
        title: "Your account",
        summary: "Your name, how you sign in, and which emails you receive.",
        points: [
          ["Name", "shown on your comments and approvals."],
          ["Email notifications", "turn each type on or off."],
          ["Password", "optional. You can always sign in with an email link."],
          ["Page guides", "bring back any guides you've hidden."],
        ],
      };
    case "home":
      return agency
        ? {
            id: "home-agency",
            title: "Client overview",
            summary: "Everything happening for this client right now, in the order it needs attention.",
            points: [
              ["Awaiting client approval", "posts sent to the client, with their deadlines."],
              ["Needs the team", "change requests and items in internal review."],
              ["This month", "progress against the package quotas."],
              ["Timeline and updates", "the same view the client sees."],
            ],
          }
        : {
            id: "home-client",
            title: "Your home page",
            summary: "Answers two questions at a glance: what's happening, and what do we need from you?",
            points: [
              [audience === "approver" ? "Needs your approval" : "Awaiting approval", "open a post to preview it, then approve it or ask for changes."],
              ["This month", "how many posts are published, ready or in progress against your package."],
              ["Waiting on you", "things the team needs, like photos or answers."],
              ["Latest updates", "news from the team and recent comments."],
            ],
          };
    case "plan":
      return agency
        ? {
            id: "plan-agency",
            title: "Monthly plan",
            summary: "The month in one place: what you'll post, when, and how far along it is.",
            points: [
              audience === "team_member"
                ? ["Sharing with the client", "the plan stays hidden from the client until an admin shares it."]
                : ["Share with client", "the plan stays hidden from the client until you share it. Only admins can share it."],
              ["Add content", "create a post, reel or story for this month."],
              ["Overview", "progress against the package, plus this month's posts that are ready, need approval or are in progress."],
              ["Updates", "visible to the client."],
            ],
          }
        : {
            id: "plan-client",
            title: "Your monthly plan",
            summary: "What we're posting this month, when it goes out, and how it's going.",
            points: [
              ["Themes and goals", "what this month's content is about."],
              ["Overview", "how many posts are published, plus the ones ready, needing approval or being made."],
              ["Timeline", "tap any post to preview it."],
              ["Key dates", "launches and events we're planning around."],
            ],
          };
    case "content":
      return agency
        ? {
            id: "content-agency",
            title: "Content item",
            summary: "One post from plan to publish. The bar at the top shows which stage it's at.",
            points: [
              ["Upload media", "every upload is kept as a version, so nothing is lost."],
              audience === "team_member"
                ? ["Send for review", "an admin checks it and sends it to the client. They get a notification."]
                : ["Internal review", "you check it, then send it to the client. Only admins can send posts to the client."],
              ["After approval", "mark it scheduled, then published with the live link."],
              ["Delete", "any post that isn't published yet."],
              ["Internal notes", "never shown to the client."],
            ],
          }
        : {
            id: "content-client",
            title: "Review this post",
            summary: "See the post as it will appear, then approve it or ask for changes.",
            points: [
              ["Preview", "swipe to see every slide."],
              [audience === "approver" ? "Approve" : "Approval", audience === "approver" ? "when it's ready to go live." : "your approvers sign off on each post."],
              ["Request changes", "tell us what to change and we'll send a new version."],
              ["Comments", "ask questions here. The team is notified."],
            ],
          };
    case "new-content":
      return {
        id: "new-content",
        title: "New content item",
        summary: "Plan a post, reel or story. It starts as Planned until media is uploaded.",
        points: [
          ["Planned date", "in the client's time zone."],
          ["Destination link", "tracking labels are added for each platform automatically."],
          ["Tags", "some, like AI-generated, can require every approver to sign off."],
          ["Media", "you can upload it on the next screen."],
        ],
      };
    case "tasks":
      return agency
        ? {
            id: "tasks-agency",
            title: "Tasks",
            summary: "Work that isn't a post, plus anything you're waiting on the client for.",
            points: [
              ["Owner", "assign each task to someone at the agency or the client."],
              ["Client tasks", "appear under Waiting on you on the client's home page."],
              ["Internal", "tick this to hide a task from the client."],
              ["Team board", "shows tasks across all clients."],
            ],
          }
        : {
            id: "tasks-client",
            title: "Action items",
            summary: "Things the team needs from you, and what they're working on for you.",
            points: [
              ["Waiting on you", "tick an item when it's done. The team sees it straight away."],
              ["Due dates", "overdue items are shown in red."],
              ["The team is working on", "what's in progress at the agency."],
            ],
          };
    case "brand":
      return {
        id: "brand",
        title: agency ? "Brand kit" : "Your brand kit",
        summary: agency
          ? "Everything the team needs to keep content on brand."
          : "The brand guidelines we follow when creating your content.",
        points: [
          ["Colours, fonts and tone", "how content should look and sound."],
          ["Topics to avoid", "things never to post about."],
          ["FAQ answers", "approved replies for customer messages."],
          [
            "Files",
            agency || audience === "approver" ? "upload and download logos, photos and guidelines." : "download logos and guidelines.",
          ],
        ],
      };
    case "library":
      return {
        id: "library",
        title: "Library",
        summary: agency
          ? "Every file for this client in one place: product photos, videos, logos and documents."
          : "Your product photos, videos, logos and documents, shared with the team in one place.",
        points: [
          ["Upload files", agency || audience === "approver" ? "drop in photos, videos or documents and choose a folder." : "the team and your approvers add files here."],
          ["Find things fast", "filter by photos, videos or documents, pick a folder, or search by name."],
          ["Open a file", audience === "admin" ? "see it large, download it, rename it, move it to another folder or delete it." : "see it large and download it. Only agency admins can rename, move or delete files."],
          ["Download several", "press Download all, or Select to tick files and download just those as one ZIP."],
          ["From posts", "every photo and video used in this client's posts, linked to the post."],
        ],
      };
    case "offers":
      return {
        id: "offers",
        title: "Offers",
        summary: agency
          ? "Sales, discounts and launches the client tells you about, in their own words, so you can plan posts around them."
          : "Tell the agency team about a sale, a discount or a launch, in your own words, so they can plan posts around it.",
        points: agency
          ? [
              ["Who posts", "only the client shares offers here. You read them and plan posts."],
              ["Who's told", "you get a notification and an email for each new offer."],
              ["Plan a post", "opens New content so you can plan a post for it."],
            ]
          : [
              ["Sharing an offer", "write it the way you'd tell us (what, when, any code), then press Share with the team."],
              ["Who's told", "the agency team gets a notification and an email straight away."],
              ["Changed your mind", "remove an offer you shared and post a new one."],
            ],
      };
    case "settings":
      if (audience === "admin")
        return {
          id: "settings-admin",
          title: "Client settings",
          summary: "How this client is set up: profile, package, approval rules and who has access.",
          points: [
            ["Package", "quotas drive the monthly deliverable counters."],
            ["Approval rule", "one approver is enough, or every approver must sign off."],
            ["Tag rules", "e.g. AI-generated content always needs every approver."],
            ["People", "invite approvers and viewers, and assign your team."],
          ],
        };
      if (agency)
        return {
          id: "settings-team",
          title: "Client profile",
          summary: "Read-only details about this client. Ask an admin to change them.",
          points: [
            ["Goals", "the current focus and agreed success measures."],
            ["Rules", "tags that need every approver."],
            ["Starting baseline", "numbers recorded on day one."],
          ],
        };
      return {
        id: "settings-client",
        title: "Team and package",
        summary: "What's included in your package, and who in your team can use the portal.",
        points: [
          ["Package", "what's included each month."],
          ["Invite colleagues", "as approvers or viewers."],
          ["Approvers", "can approve content and invite people."],
          ["Viewers", "can follow along and comment."],
        ],
      };
    default:
      return { id: key, title: "", summary: "", points: [] };
  }
}
