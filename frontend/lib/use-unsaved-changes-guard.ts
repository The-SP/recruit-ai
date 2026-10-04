"use client";

import { useEffect } from "react";

/**
 * Asks before leaving a page with unsaved edits.
 *
 * `beforeunload` only covers reloads, closing the tab and external links;
 * Next's <Link> navigates client-side and never fires it. So in-app links are
 * caught on click as well, in the capture phase on `document`, which runs
 * before React's root listener and therefore before Link's own handler.
 * Browser back/forward is not covered: the App Router has no hook to cancel
 * that navigation.
 */
export function useUnsavedChangesGuard(
  active: boolean,
  message = "You have unsaved changes. Leave without saving?"
) {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Still required by some browsers to show the prompt.
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      // Modified clicks open a new tab, which leaves this page intact.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.origin !== window.location.origin) {
        // External links unload the page, which beforeunload already asks about.
        return;
      }
      if (
        anchor.pathname === window.location.pathname &&
        anchor.search === window.location.search
      ) {
        return;
      }
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, message]);
}
