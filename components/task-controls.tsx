"use client";

import { useActionState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { deleteTask, setTaskStatus } from "@/app/actions/tasks";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Tick box that marks a task done (or reopens it). */
export function TaskCheck({ taskId, status, label }: { taskId: string; status: TaskStatus; label: string }) {
  const [state, action] = useActionState(setTaskStatus, null);
  const [pending, start] = useTransition();
  const done = status === "done";
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? `Reopen: ${label}` : `Mark done: ${label}`}
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("task_id", taskId);
          fd.set("status", done ? "todo" : "done");
          start(() => action(fd));
        }}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
          done ? "border-emerald-700 bg-emerald-700 text-white" : "border-line-strong bg-surface hover:border-ink",
          pending && "opacity-50",
        )}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : null}
      </button>
      {state?.error ? <span className="sr-only" role="alert">{state.error}</span> : null}
    </span>
  );
}

const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", in_review: "In review", done: "Done" };

/** Status menu. `options` lists what this person may switch the task to. */
export function TaskStatusSelect({ taskId, status, options }: { taskId: string; status: TaskStatus; options: TaskStatus[] }) {
  const [state, action] = useActionState(setTaskStatus, null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label="Task status"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("task_id", taskId);
          fd.set("status", e.target.value);
          start(() => action(fd));
        }}
        className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink-soft"
      >
        {options.includes(status) ? null : <option value={status}>{STATUS_LABELS[status]}</option>}
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {state?.error ? (
        <span className="mt-1 text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : null}
    </span>
  );
}

export function TaskDelete({ taskId }: { taskId: string }) {
  const [, action] = useActionState(deleteTask, null);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete task"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this task?")) return;
        const fd = new FormData();
        fd.set("task_id", taskId);
        start(() => action(fd));
      }}
      className="rounded p-1 text-faint hover:bg-sunken hover:text-danger"
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}
