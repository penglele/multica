"use client";

import type { ReactNode } from "react";
import { ModalRegistry } from "../modals/registry";
import { DashboardGuard } from "./dashboard-guard";
import { NavigationProgress } from "./navigation-progress";
import { WorkspacePresencePrefetch } from "./workspace-presence-prefetch";

interface WorkspaceLayoutProps {
  children: ReactNode;
  extra?: ReactNode;
  loadingIndicator?: ReactNode;
}

/**
 * WorkspaceLayout is the BONCML Workspace shell layout — used by routes
 * that present the new product surface (`/[slug]/rooms/...`).
 *
 * Differs from DashboardLayout in one deliberate way: there's no global
 * `AppSidebar`. The user's only left-side navigation inside a workspace
 * is the WorkspaceLeftRail rendered by WorkspaceRoomPage. This is
 * required by the productization plan section 10.4: a user looking at
 * BONCML Workspace must NOT see multica-era primary entries
 * (Issues / Channels / Squads) as competing nav.
 *
 * Everything else is preserved: auth guard, workspace presence prefetch,
 * modals, toaster, navigation progress. We just don't pull in
 * SidebarProvider since nothing inside Workspace uses it.
 */
export function WorkspaceLayout({
  children,
  extra,
  loadingIndicator,
}: WorkspaceLayoutProps) {
  return (
    <DashboardGuard
      loadingFallback={
        <div className="flex h-svh items-center justify-center">
          {loadingIndicator}
        </div>
      }
    >
      <div className="relative flex h-svh w-full flex-col overflow-hidden">
        <WorkspacePresencePrefetch />
        <NavigationProgress />
        <div className="flex flex-1 min-h-0 w-full">{children}</div>
        <ModalRegistry />
        {extra}
      </div>
    </DashboardGuard>
  );
}
