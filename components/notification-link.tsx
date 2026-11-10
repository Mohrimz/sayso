"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { markNotificationRead } from "@/app/actions/notifications";
import { cn } from "@/lib/utils";

/**
 * A notification row. It is a normal link, so it opens the page straight
 * away; marking it read happens in the background and can never block or
 * cancel the navigation.
 */
export function NotificationLink({
  id,
  href,
  unread,
  className,
  children,
}: {
  id: string;
  href: string;
  unread: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      onClick={() => {
        if (unread) markNotificationRead(id).catch(() => {});
      }}
      className={cn("block", className)}
    >
      {children}
    </Link>
  );
}
