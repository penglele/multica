"use client";

import { WorkspaceLayout } from "@multica/views/layout";
import { MulticaIcon } from "@multica/ui/components/common/multica-icon";
import { SearchCommand } from "@multica/views/search";

import { StarterContentPrompt } from "@multica/views/onboarding";

// (workspace-room) is the BONCML Workspace route group. Pages inside it
// land on the new product shell (WorkspaceRoomPage) without the legacy
// AppSidebar — see WorkspaceLayout for why.
//
// Everything else (modal registry, search, chat fab, starter prompt) is
// preserved so users keep access to global affordances regardless of
// which group they're in.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceLayout
      loadingIndicator={<MulticaIcon className="size-6" />}
      extra={
        <>
          <SearchCommand />
          <StarterContentPrompt />
        </>
      }
    >
      {children}
    </WorkspaceLayout>
  );
}
