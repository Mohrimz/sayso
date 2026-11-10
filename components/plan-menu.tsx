"use client";

import { useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { Archive, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { setPlanStatus } from "@/app/actions/plans";

const item =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-sunken data-[highlighted]:text-ink";

type Status = "draft" | "active" | "closed";

/**
 * Less common plan actions, tucked behind a "⋯" button. Sharing a month with
 * the client, or hiding it again, is for agency admins (canShare); team
 * members can still close and reopen a month the client already sees.
 */
export function PlanMenu({ planId, status, canShare }: { planId: string; status: Status; canShare: boolean }) {
  const [pending, start] = useTransition();
  const run = (next: Status) =>
    start(async () => {
      const fd = new FormData();
      fd.set("plan_id", planId);
      fd.set("status", next);
      const result = await setPlanStatus(null, fd);
      if (result?.error) toast.error(result.error);
      else if (result?.message) toast.success(result.message);
    });

  // Moving into or out of draft changes whether the client sees the month.
  const allowed = (next: Status) => canShare || (status === "draft") === (next === "draft");
  const actions = [
    status !== "active" && allowed("active") ? { next: "active" as const, icon: Eye, label: status === "closed" ? "Reopen month" : "Share with client" } : null,
    status === "active" && allowed("draft") ? { next: "draft" as const, icon: EyeOff, label: "Hide from client" } : null,
    status !== "closed" && allowed("closed") ? { next: "closed" as const, icon: Archive, label: "Close month" } : null,
  ].filter((a) => a !== null);
  if (!actions.length) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={pending}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-soft hover:bg-sunken data-[state=open]:bg-sunken"
        aria-label="More plan actions"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="animate-pop z-50 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10">
          {actions.map((a) => (
            <DropdownMenu.Item key={a.next} className={item} onSelect={() => run(a.next)}>
              <a.icon className="size-4" aria-hidden /> {a.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
