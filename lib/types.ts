import type { Enums, Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;
export type Workspace = Tables<"workspaces">;
export type Package = Tables<"packages">;
export type BrandKit = Tables<"brand_kits">;
export type WorkspaceMember = Tables<"workspace_members">;
export type MonthlyPlan = Tables<"monthly_plans">;
export type ContentItem = Tables<"content_items">;
export type ContentVersion = Tables<"content_versions">;
export type Comment = Tables<"comments">;
export type InternalNote = Tables<"internal_notes">;
export type Approval = Tables<"approvals">;
export type Task = Tables<"tasks">;
export type ProgressUpdate = Tables<"progress_updates">;
export type Notification = Tables<"notifications">;

export type ContentStatus = Enums<"content_status">;
export type ContentType = Enums<"content_type">;
export type TaskStatus = Enums<"task_status">;
export type PlanStatus = Enums<"plan_status">;
export type MemberRole = Enums<"member_role">;
export type UserSide = Enums<"user_side">;

export type NotificationPrefs = {
  email_approvals: boolean;
  email_comments: boolean;
  email_changes: boolean;
  email_tasks: boolean;
  email_messages: boolean;
  /** New client offers (agency only). */
  email_offers: boolean;
};

export type SocialAccount = { platform: string; handle: string; url?: string };
export type KeyDate = { date: string; label: string };
export type Colour = { name: string; hex: string };
export type Font = { name: string; usage?: string };
export type Faq = { question: string; answer: string };
export type ApprovalRuleEntry = { tag: string; requirement: "all_approvers"; note?: string };
export type Quotas = { feed_post?: number; reel?: number; story?: number; report?: number };
export type Baseline = {
  recorded_on?: string;
  followers?: Record<string, number>;
  monthly_reach?: number;
  engagement_rate?: number;
  notes?: string;
};

/** Reads a jsonb column as a typed array, tolerating bad data. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asObject<T extends object>(value: unknown): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
}
