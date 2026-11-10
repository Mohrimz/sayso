import { APP_NAME } from "@/lib/env";

/** Who runs this deployment of the portal, as named in the Privacy Policy. */
export const LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME || APP_NAME;

/** A monitored inbox for privacy requests. Leave empty to point people to their agency contact instead. */
export const PRIVACY_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "";

export const PRIVACY_UPDATED = "9 November 2026";
