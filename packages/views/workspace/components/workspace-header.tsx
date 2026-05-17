"use client";

import type { ReactNode } from "react";
import { ChevronRight, Hash, Lock } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";

export type AnalysisStepKey =
  | "data_quality"
  | "analysis_plan"
  | "boncml_run"
  | "exec_summary"
  | "command_deck";

interface AnalysisStep {
  key: AnalysisStepKey;
  label: string;
}

// W1: the breadcrumb is a static visual rail. Per the plan it should
// eventually be derived from task/artifact state (W3+); we wire the active
// step as a prop so future code can flip it as the room progresses.
const STEPS: AnalysisStep[] = [
  { key: "data_quality", label: "DATA QUALITY" },
  { key: "analysis_plan", label: "ANALYSIS PLAN" },
  { key: "boncml_run", label: "BONCML RUN" },
  { key: "exec_summary", label: "EXEC SUMMARY" },
  { key: "command_deck", label: "COMMAND DECK" },
];

interface WorkspaceHeaderProps {
  /** Room display name. Required because every workspace room has one. */
  roomName: string;
  /** "public" / "private" / etc. Drives the icon. */
  roomType?: string;
  /** Optional one-line subtitle (e.g. dataset / topic title from mockup). */
  subtitle?: string;
  /** Currently-active step; defaults to data_quality so a fresh room shows
   *  the first stage as active. */
  activeStep?: AnalysisStepKey;
  /** Right-side actions (members button, settings, etc.). Page-level chrome,
   *  not breadcrumb-level. */
  actions?: ReactNode;
}

export function WorkspaceHeader({
  roomName,
  roomType,
  subtitle,
  activeStep = "data_quality",
  actions,
}: WorkspaceHeaderProps) {
  const activeIdx = STEPS.findIndex((s) => s.key === activeStep);

  return (
    <div className="flex shrink-0 flex-col border-b border-border">
      {/* First layer: room title + actions. */}
      <div className="flex h-12 items-center gap-2 px-4">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {roomType === "private" ? (
            <Lock className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Hash className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-semibold">{roomName}</span>
          {subtitle && (
            <span className="hidden truncate text-xs text-muted-foreground sm:block">
              — {subtitle}
            </span>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {/* Second layer: analysis breadcrumb. */}
      <div
        className="flex h-8 items-center gap-1 overflow-x-auto px-4 text-[10px] uppercase tracking-wide"
        aria-label="Analysis flow"
      >
        {STEPS.map((step, i) => {
          const isActive = i === activeIdx;
          const isPast = activeIdx >= 0 && i < activeIdx;
          return (
            <div key={step.key} className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  isActive && "bg-brand/10 text-brand font-medium",
                  isPast && "text-foreground/70",
                  !isActive && !isPast && "text-muted-foreground/60",
                )}
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRight className="size-3 text-muted-foreground/40" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
