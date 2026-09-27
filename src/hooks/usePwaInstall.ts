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

const isTouchDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(COARSE_POINTER_QUERY).matches || navigator.maxTouchPoints > 0;
};

const detectVariant = (): InstallVariant | null => {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS 13+ reports as "MacIntel" in desktop mode — only real iPads
    // also report multi-touch, unlike an actual Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS)
    return /CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/i.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/.test(ua)) {
    return /SamsungBrowser|Firefox|EdgA|OPR|UCBrowser|MiuiBrowser/i.test(ua)
      ? "android-other"
      : "android-chrome";
  }
  return null;
};

export const isStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's legacy flag — display-mode media query support there
    // has been inconsistent across versions, so check both.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

// Computed once at mount (see the lazy useState init below) — no reason to
// run this again later, none of its inputs (UA, media queries, standalone
// display mode) change over an app session.
const computeVariant = (): InstallVariant | null => {
  if (isStandalone()) return null;
  const detected = detectVariant();
  if (!detected) return null;
  if (!window.matchMedia(MOBILE_QUERY).matches) return null;
  if (!isTouchDevice()) return null;
  return detected;
};

/**
 * Drives the install-PWA button (see InstallPwaButton.tsx). Android/Chrome
 * exposes a real `beforeinstallprompt` event for a one-tap native install;
 * every other combo (iOS Safari, iOS Chrome, or Android without the event)
 * has no such API, so `variant` just means "show manual instructions for
 * this browser" — see InstallPwaButton.tsx's per-variant step lists.
 */
export const usePwaInstall = () => {
  const [variant, setVariant] = useState<InstallVariant | null>(computeVariant);
  const [canPromptNatively, setCanPromptNatively] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (variant !== "android-chrome") return;

    // Android: upgrade to the one-tap native prompt once Chrome actually
    // offers it — its own eligibility heuristics (engagement, manifest
    // validity, etc.) decide this, not us.
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setCanPromptNatively(true);
    };
    const onInstalled = () => {
      deferredPrompt.current = null;
      setCanPromptNatively(false);
      setVariant(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [variant]);

  const promptInstall = async () => {
    const event = deferredPrompt.current;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    deferredPrompt.current = null;
    setCanPromptNatively(false);
    setVariant(null);
  };

  return { variant, canPromptNatively, promptInstall };
};
