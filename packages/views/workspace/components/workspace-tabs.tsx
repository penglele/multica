"use client";

import type { ReactNode } from "react";
import { MessageSquare, ListChecks, Package, History } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";

export type WorkspaceTab = "chat" | "tasks" | "artifacts" | "audit";

interface WorkspaceTabsProps {
  value: WorkspaceTab;
  onValueChange: (next: WorkspaceTab) => void;
  /** Optional right-side adornment (e.g. action buttons specific to the
   *  active tab). The W1 shell doesn't use this yet but we leave the slot
   *  so W3+ can drop "+ New task" or similar without restructuring. */
  rightAdornment?: ReactNode;
}

interface TabDef {
  key: WorkspaceTab;
  label: string;
  icon: ReactNode;
}

// Order chosen to match the plan section 6.5: CHAT first because it's the
// entry point users start in, then the structured artefacts and the
// retrospective audit.
const TABS: TabDef[] = [
  { key: "chat", label: "CHAT", icon: <MessageSquare className="size-3.5" /> },
  { key: "tasks", label: "TASKS", icon: <ListChecks className="size-3.5" /> },
  { key: "artifacts", label: "ARTIFACTS", icon: <Package className="size-3.5" /> },
  { key: "audit", label: "AUDIT", icon: <History className="size-3.5" /> },
];

export function WorkspaceTabs({ value, onValueChange, rightAdornment }: WorkspaceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Workspace tabs"
      className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-3"
    >
      {TABS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-[11px] font-medium uppercase tracking-wide transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
      {rightAdornment && <div className="ml-auto">{rightAdornment}</div>}
    </div>
  );
}
