"use client";

// WorkspaceShell is the BONCML Workspace's layout primitive: a 3-zone
// frame (left rail, top header, main area) that the room page composes.
// Owning the layout in one place means W3+ can change zone proportions
// without touching every consumer.

import type { ReactNode } from "react";
import { cn } from "@multica/ui/lib/utils";

interface WorkspaceShellProps {
  /** Left column. Typically <WorkspaceLeftRail />. */
  leftRail: ReactNode;
  /** Top of the main area. Typically <WorkspaceHeader />. */
  header: ReactNode;
  /** Below the header. Typically <WorkspaceTabs /> + active tab content. */
  children: ReactNode;
  className?: string;
}

export function WorkspaceShell({ leftRail, header, children, className }: WorkspaceShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 w-full bg-background", className)}>
      {leftRail}
      <main className="flex flex-1 flex-col min-w-0 min-h-0">
        {header}
        {children}
      </main>
    </div>
  );
}
