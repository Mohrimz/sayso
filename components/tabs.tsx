"use client";

import { useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Tabs as RTabs } from "radix-ui";
import { cn } from "@/lib/utils";

export type TabDef = { value: string; label: string; count?: number };

/** Tabs with a sliding underline. Panels are TabsContent children. */
export function Tabs({
  tabs,
  defaultValue,
  children,
  className,
}: {
  tabs: TabDef[];
  defaultValue?: string;
  children: ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? tabs[0]?.value);
  const id = useId();
  return (
    <RTabs.Root value={value} onValueChange={setValue} className={className}>
      {/* On phones the strip scrolls sideways; the soft right edge shows there's more. */}
      <RTabs.List className="scroll-thin -mx-4 flex snap-x gap-1 overflow-x-auto border-b border-line px-4 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-28px),transparent)] [scrollbar-width:none] sm:mx-0 sm:px-0 sm:[mask-image:none]">
        {tabs.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            onClick={(e) => e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })}
            className="relative shrink-0 snap-start rounded-t-md px-3 pt-1.5 pb-2.5 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:text-ink"
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.count ? (
                <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", value === t.value ? "bg-accent text-white" : "bg-sunken text-muted")}>
                  {t.count}
                </span>
              ) : null}
            </span>
            {value === t.value ? (
              <motion.span
                layoutId={`tab-underline-${id}`}
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            ) : null}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RTabs.Content value={value} className={cn("pt-5 outline-none", className)}>
      <div className="animate-rise">{children}</div>
    </RTabs.Content>
  );
}
