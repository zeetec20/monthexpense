/** iOS PWA/WKWebView cold-launch bug: `innerHeight`/`visualViewport.height`
 * can report a value shorter than the true screen size, leaving a gap
 * below AppShell's bottom nav — WebKit only resyncs on a genuine
 * touch-driven scroll, or (confirmed live, on-device) a real
 * programmatic scroll with actual overflow to move through. This app
 * deliberately has no page-level scroll (single inner scroll region by
 * design), so a bare `scrollTo()` has nothing to move and is a no-op —
 * every earlier attempt (meta-viewport toggle, forced reflow, scrollTo
 * with nothing to scroll, dispatched resize/orientationchange,
 * reloading — a reload is itself a cold launch, so it can't fix a
 * cold-launch bug) failed for exactly that reason. Confirmed live:
 * giving the page 2px of real overflow, then actually scrolling that
 * distance, forces the resync.
 *
 * Safe to call unconditionally and often — the scroll is instant (no
 * `behavior: smooth`), 2px is imperceptible, and it's a harmless bounce
 * even when nothing was actually stuck.
 */
export function nudgeViewport(): void {
  if (typeof document === "undefined") return;
  const { body, documentElement: html } = document;
  const prevBodyMinHeight = body.style.minHeight;
  const prevBodyOverflow = body.style.overflow;
  const prevHtmlOverflow = html.style.overflow;

  body.style.minHeight = "calc(100vh + 2px)";
  body.style.overflow = "auto";
  html.style.overflow = "auto";

  // Timing mirrors the exact sequence verified live on-device.
  setTimeout(() => {
    window.scrollTo(0, 2);
    setTimeout(() => {
      window.scrollTo(0, 0);
      setTimeout(() => {
        body.style.minHeight = prevBodyMinHeight;
        body.style.overflow = prevBodyOverflow;
        html.style.overflow = prevHtmlOverflow;
      }, 200);
    }, 100);
  }, 50);
}
