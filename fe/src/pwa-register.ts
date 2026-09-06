// Registers the service worker and drives the update flow. registerType:
// "prompt" (vite.config.ts) is required here, not "autoUpdate" — autoUpdate
// makes the new SW self-skipWaiting immediately, which skips the browser's
// `waiting` state (and with it the only code path that calls
// `onNeedRefresh` — confirmed by reading
// node_modules/vite-plugin-pwa/dist/client/build/register.js) so there'd
// be no hook to show an "updating…" modal before the reload. We still want
// this fully automatic with no real user-facing prompt, so onNeedRefresh
// below calls the returned updateSW() itself the instant it fires.
import { registerSW } from "virtual:pwa-register";

// Plain pub/sub, not React state — this module loads before any component
// does. PwaUpdateModal.tsx observes it via useSyncExternalStore.
type Listener = () => void;
let updating = false;
const listeners = new Set<Listener>();
function setUpdating(next: boolean) {
  if (updating === next) return;
  updating = next;
  listeners.forEach((l) => l());
}
export function subscribePwaUpdate(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getPwaUpdating() {
  return updating;
}

// Set right before the update-triggered reload fires; read once on the
// next boot (PwaUpdateModal.tsx) to show a one-time "Updated!" modal — the
// reload is a full navigation, so this can't just be React state.
export const PWA_UPDATE_MARKER = "pwa-just-updated";

/** A new service worker precaches the *entire* app shell before it can
 * reach the `waiting` state that triggers onNeedRefresh below — with the
 * OCR/heic2any chunks that's several MB, easily longer than a typical
 * mobile session (open app, do one thing, close it), so that install can
 * plausibly never finish in time and the update never lands, no matter
 * how often registration.update() re-starts it. /version.json is
 * deliberately outside Workbox's precache globs (vite.config.ts) — always
 * a genuine network fetch — so this converges immediately instead of
 * racing a multi-megabyte background download: on a mismatch, drop this
 * SW registration and its caches entirely so the reload is a fresh,
 * uncontrolled network fetch of everything. */
async function checkBuildVersion() {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return;
    const { buildId } = (await res.json()) as { buildId?: string };
    if (!buildId || buildId === __APP_BUILD_ID__) return;

    setUpdating(true);
    sessionStorage.setItem(PWA_UPDATE_MARKER, "1");
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload();
  } catch {
    // Offline or blocked fetch — best-effort, next trigger tries again.
  }
}

const updateSW = registerSW({
  onNeedRefresh() {
    setUpdating(true);
    sessionStorage.setItem(PWA_UPDATE_MARKER, "1");
    // No real "click to update" banner — trigger it ourselves immediately.
    // The reload itself happens via this module's own internal
    // `controlling` listener (registered alongside onNeedRefresh) once the
    // skip-waiting message lands.
    void updateSW();
    // Safety valve: if controllerchange never actually fires (registration
    // hiccup), don't trap the user behind a blocking modal forever.
    setTimeout(() => {
      if (updating) {
        setUpdating(false);
        sessionStorage.removeItem(PWA_UPDATE_MARKER);
      }
    }, 20_000);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // Catches a mismatch on the very next open, not just after an hour or
    // a backgrounding cycle.
    void checkBuildVersion();
    // Covers a tab left open for a long time without a full revisit.
    setInterval(() => {
      void registration.update();
      void checkBuildVersion();
    }, 60 * 60 * 1000);
    // Covers a tab switched away from and back to — a hard refresh alone
    // doesn't get a desktop tab current any faster than this: once a SW
    // controls the page, every navigation (hard refresh included) is
    // served from that SW's own precached copy, not the network, until a
    // new SW has actually finished installing and taken over. Checking on
    // every refocus, not just once an hour, is what closes that gap.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void registration.update();
        void checkBuildVersion();
      }
    });
  },
  onRegisterError() {
    setUpdating(false);
  },
});
