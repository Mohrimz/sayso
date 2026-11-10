export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Development only: a sign-in or invite link to show on screen. */
  devLink?: string;
  /** Optional data for the client, e.g. an invite link to copy. */
  data?: Record<string, string>;
} | null;
