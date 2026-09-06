import { useEffect, useRef, useState } from "react";

// Not in lib.dom.d.ts — Chrome-family only, minimal shape actually used.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallVariant = "android-chrome" | "android-other" | "ios-safari" | "ios-other";

const MOBILE_QUERY = "(max-width: 768px)";
// A mobile OS UA plus a narrow viewport still isn't proof of a real mobile
// device (a desktop browser resized narrow reports a desktop UA already,
// so that alone was safe — this is belt-and-suspenders): a coarse pointer
// is what an actual touchscreen reports, a mouse-only desktop never does,
// even DevTools' generic "Responsive" mode without a specific device
// preset selected.
const COARSE_POINTER_QUERY = "(pointer: coarse)";

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(COARSE_POINTER_QUERY).matches || navigator.maxTouchPoints > 0;
}

function detectVariant(): InstallVariant | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS 13+ reports as "MacIntel" in desktop mode — only real iPads
    // also report multi-touch, unlike an actual Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/i.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/.test(ua)) {
    return /SamsungBrowser|Firefox|EdgA|OPR|UCBrowser|MiuiBrowser/i.test(ua) ? "android-other" : "android-chrome";
  }
  return null;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's legacy flag — display-mode media query support there
    // has been inconsistent across versions, so check both.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Drives the install-PWA button (see InstallPwaButton.tsx). Android/Chrome
 * exposes a real `beforeinstallprompt` event for a one-tap native install;
 * every other combo (iOS Safari, iOS Chrome, or Android without the event)
 * has no such API, so `variant` just means "show manual instructions for
 * this browser" — see InstallPwaButton.tsx's per-variant step lists.
 */
export function usePwaInstall() {
  const [variant, setVariant] = useState<InstallVariant | null>(null);
  const [canPromptNatively, setCanPromptNatively] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    const detected = detectVariant();
    if (!detected) return;
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (!isTouchDevice()) return;
    setVariant(detected);

    if (detected !== "android-chrome") return;

    // Android: upgrade to the one-tap native prompt once Chrome actually
    // offers it — its own eligibility heuristics (engagement, manifest
    // validity, etc.) decide this, not us.
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setCanPromptNatively(true);
    }
    function onInstalled() {
      deferredPrompt.current = null;
      setCanPromptNatively(false);
      setVariant(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall() {
    const event = deferredPrompt.current;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    deferredPrompt.current = null;
    setCanPromptNatively(false);
    setVariant(null);
  }

  return { variant, canPromptNatively, promptInstall };
}
