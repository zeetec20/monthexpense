"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

/**
 * Shared portal target for every sheet/select/popover in the app — the
 * AppShell's own root node (`id="app-shell-root"`, see AppShell.tsx),
 * not `document.body`. Keeps everything visually boxed inside the
 * "phone shell" frame on desktop instead of escaping to the full
 * viewport, and — since it's a DOM *sibling* of `main`, not a
 * descendant — sidesteps `main`'s `overflow-y-auto` clipping any sheet
 * triggered from deep inside the tree.
 */
export function useShellPortalContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- the target node doesn't exist in the DOM until after mount commits, nothing to derive during render
    setContainer(document.getElementById("app-shell-root"));
  }, []);
  return container;
}

/**
 * Bottom-sheet drawer built on vaul (via shadcn's Drawer primitives,
 * ui/drawer.tsx) — replaces an earlier hand-rolled Radix Dialog +
 * manual pointer-event drag implementation that went through several
 * rounds of drag-related bugs (stuck mid-drag, snap-back glitches,
 * inconsistent close speed across sheet heights). vaul is the
 * purpose-built library for exactly this: velocity-aware drag dismiss,
 * scroll-vs-drag detection so inputs/selects inside the sheet don't
 * fight the gesture, Radix Dialog underneath for focus-trap/Escape/
 * scroll-lock. This is the app's one modal surface — used both by the
 * small action sheets (AppShell, SyncMenu, NotificationDrawer,
 * Transactions' filter sheet) and the bigger content modals
 * (ExpenseDetailModal, WalletSettingsPage, the Scan/Voice/Manual entry
 * picker).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  /** Required for a11y (Radix Dialog needs a Title) — rendered visually
   * hidden; callers keep whatever visible heading they already render in
   * `children`. */
  title: string;
  children: ReactNode;
  className?: string;
  /** false disables both swipe-to-close and outside-tap-to-close (vaul's
   * own prop, passed straight through) — for content with its own
   * "step back" affordance that would otherwise get swallowed by the
   * sheet's own drag-dismiss gesture (see Scan drawer's fullscreen
   * camera in App.tsx: swiping down to back out of fullscreen used to
   * close the whole sheet and lose the in-progress scan instead). */
  dismissible?: boolean;
}) {
  const container = useShellPortalContainer();
  if (!container) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      container={container}
      dismissible={dismissible}
      // Swipe-to-dismiss can only start from the grip handle now, never
      // from content — vaul's Content skips its own drag logic entirely
      // in this mode, so scrolling never has to compete with it (see
      // drawer.tsx's DrawerHandle doc comment for the mechanism).
      handleOnly
    >
      <DrawerContent className={className}>
        <DrawerTitle>{title}</DrawerTitle>
        {/* Fixed to the sheet chrome itself, not per-content — every
            caller used to render its own close button inline, which drifted
            out of place whenever that content was narrower than the sheet. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 p-1 rounded-full text-ink-faint hover:text-ink"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </DrawerContent>
    </Drawer>
  );
}
