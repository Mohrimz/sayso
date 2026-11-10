import "server-only";
import { after } from "next/server";
import { deliverPendingNotifications } from "@/lib/email";

export function fail(error: string) {
  return { ok: false, error } as const;
}

export function done(message?: string, extra?: { devLink?: string; data?: Record<string, string> }) {
  return { ok: true, message, ...extra } as const;
}

/** Turns a database error into a message a person can act on. */
export function friendlyError(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? "";
  if (!message) return "Something went wrong. Please try again.";
  if (error?.code === "42501" || /row-level security|permission denied|Not allowed/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (error?.code === "23505" || /duplicate key/i.test(message)) {
    return "That already exists.";
  }
  // Workflow rules raise plain-English messages; pass them through.
  if (error?.code === "P0001") return message;
  return message;
}

export function str(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const raw = str(fd, key);
  if (raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function optNum(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function bool(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function list(fd: FormData, key: string): string[] {
  return fd
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Comma-separated text to a clean list. */
export function csv(value: string): string[] {
  return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
}

export function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Send any new notification emails after the response has been sent. */
export function deliverNotificationsLater() {
  after(async () => {
    try {
      await deliverPendingNotifications();
    } catch (error) {
      console.error("[notifications] delivery failed", error);
    }
  });
}
