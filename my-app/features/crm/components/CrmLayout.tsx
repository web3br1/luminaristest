import React from 'react';
import { CrmNav } from './CrmNav';

/**
 * Shared CRM shell. Every CRM screen mounts inside this so that navigating
 * between tabs never changes the page width/height. Renders `<CrmNav />` once
 * at the top and an inner scrollable area for the page body — pages must not
 * render their own nav or `max-w-*` wrapper.
 */
export function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans dark:bg-neutral-900">
      <div className="px-4 pt-6">
        <CrmNav />
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-6">{children}</div>
    </div>
  );
}
