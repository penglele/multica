"use client";

import type { ReactNode } from "react";

interface WorkspacePlaceholderProps {
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * Shared empty-state card for tabs that haven't shipped yet (TASKS / ARTIFACTS
 * / AUDIT during W1). Centralized so all three placeholders look identical,
 * and so we have exactly one place to update when the real view lands.
 */
export function WorkspacePlaceholder({ icon, title, description }: WorkspacePlaceholderProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted/50">
          {icon}
        </div>
        <h3 className="mb-1 text-sm font-medium">{title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
