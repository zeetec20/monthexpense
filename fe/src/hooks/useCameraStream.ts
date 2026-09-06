import { useEffect, useRef, useState } from "react";

export type CameraState = "idle" | "requesting" | "ready" | "denied" | "unavailable";

interface CameraDevice {
  id: string;
  label: string;
}

// iOS/WebKit race, ported from design-undangan-next's guest QR scanner
// (confirmed there via on-device debug): requesting a *different* physical
// camera right after the previous one's track was stopped can resolve with
// a track that's already `readyState: "ended"` — the hardware wasn't
// actually released yet. A short settle delay + bounded retry works around it.
const CAMERA_CHECK_DELAY_MS = 150;
const CAMERA_RETRY_DELAY_MS = 500;
const CAMERA_RETRY_LIMIT = 3;

// iPhones expose every physical back lens (wide/ultra-wide/tele) as its own
// device — more "cameras" than a front/back switch button should offer.
// First match per bucket wins, which is consistently the main/wide lens.
function dedupeFrontBack(devices: MediaDeviceInfo[]): CameraDevice[] {
  const seen = new Set<string>();
  const result: CameraDevice[] = [];
  for (const d of devices) {
    const bucket = /front/i.test(d.label) ? "front" : "back";
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    result.push({ id: d.deviceId, label: d.label });
  }
  // Label wording didn't disambiguate (generic/vendor labels with no
  // "front"/"back" keyword at all collapse everything into one "back"
  // bucket) but the device genuinely reports 2+ cameras — offer the first
  // two distinct ones rather than silently collapsing to 1 and hiding the
  // switch button entirely.
  if (result.length < 2 && devices.length >= 2) {
    return devices.slice(0, 2).map((d) => ({ id: d.deviceId, label: d.label }));
  }
  return result;
}

type Source = { facingMode: "environment" | "user" } | string; // string = deviceId

/** Camera access is requested only on an explicit tap (requestCamera),
 * never automatically — an earlier auto-acquire-on-open design that also
 * tried to auto-resume across visibility/focus/blur changes kept hitting
 * iOS-specific event-timing races (focus lagging the permission sheet,
 * retry timers surviving a close/reopen). Requesting only from a real
 * click sidesteps all of that: release() runs whenever the drawer closes
 * or the tab is backgrounded, and reopening/foregrounding always lands
 * back on the "tap to enable" prompt rather than trying to silently
 * resume. Front/back switching (switchCamera) is ported from
 * design-undangan-next's guest QR scanner, including its iOS black-frame
 * workaround. */
export function useCameraStream(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [switching, setSwitching] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<Source>({ facingMode: "environment" });
  const camerasRef = useRef<CameraDevice[]>([]);
  // Generation counter, not a plain cancelled boolean: the latter got
  // reset to `false` at the start of every new active session, which
  // silently "revived" a still-pending retry timer from a previous
  // session that closed and reopened within the retry window (the
  // ended-track retry's own follow-up setTimeout never re-checked the
  // boolean before firing). Each acquire() call captures the generation
  // live at call time; bumping it on every teardown makes anything from
  // an old session permanently stale, no matter what a newer session
  // does to its own state afterward.
  const generationRef = useRef(0);

  function release() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      // iOS: nulling srcObject after track.stop() alone doesn't always
      // make WebKit tear down the media session — the status-bar camera
      // indicator can keep reporting "in use". An explicit load() forces
      // a full reset of the element's internal media state.
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
  }

  async function ensureCameraList(gen: number) {
    if (camerasRef.current.length > 0 || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      camerasRef.current = dedupeFrontBack(devices.filter((d) => d.kind === "videoinput"));
      if (gen === generationRef.current) setCameras(camerasRef.current);
    } catch {
      // leave empty — switch button stays hidden, the safe default
    }
  }

  async function acquire(source: Source = sourceRef.current, attempt = 0) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    const gen = generationRef.current;
    setState("requesting");
    try {
      const constraints: MediaTrackConstraints =
        typeof source === "string" ? { deviceId: { exact: source } } : { facingMode: source.facingMode };
      const s = await navigator.mediaDevices.getUserMedia({ video: constraints });
      // Every call is now tap-triggered, so there's no "background
      // acquisition racing page focus" case to guard against anymore —
      // just whether this call's own session has since been torn down
      // (drawer closed / backgrounded / a newer tap superseded it).
      if (gen !== generationRef.current) {
        s.getTracks().forEach((track) => track.stop());
        return;
      }
      sourceRef.current = source;
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        // `autoplay` alone doesn't reliably start frames once srcObject
        // is assigned imperatively after mount (installed PWA/WebView
        // contexts especially) — some engines wait for a real user
        // gesture instead, which is why the preview used to stay blank
        // until a tap elsewhere on the page. Kick playback explicitly.
        void videoRef.current.play().catch(() => {
          // benign: AbortError when a fast camera switch replaces
          // srcObject before this play() settles
        });
      }

      // ponytail: ended-track workaround ported as-is from the reference
      // app rather than reinvented — settle delay then verify, bounded retry.
      const track = s.getVideoTracks()[0];
      setTimeout(() => {
        if (gen !== generationRef.current) return;
        if (track && track.readyState === "ended" && attempt < CAMERA_RETRY_LIMIT) {
          release();
          setTimeout(() => {
            if (gen === generationRef.current) void acquire(source, attempt + 1);
          }, CAMERA_RETRY_DELAY_MS);
          return;
        }
        setState("ready");
        void ensureCameraList(gen);
      }, CAMERA_CHECK_DELAY_MS);
    } catch (err: unknown) {
      if (gen !== generationRef.current) return;
      const name = err instanceof DOMException ? err.name : "";
      setState(name === "NotAllowedError" || name === "PermissionDeniedError" ? "denied" : "unavailable");
    }
  }

  useEffect(() => {
    // Driven by `active`, not just mount/unmount — release() otherwise
    // only ran once the drawer's Presence/exit animation actually
    // finished unmounting this hook's owner, which isn't guaranteed to
    // happen promptly (or at all) on schedule in every browser. Keying
    // this effect on `active` releases the camera the instant the Scan
    // drawer's `open` state flips false, no animation/unmount wait.
    if (!active) {
      generationRef.current++;
      release();
      setState("idle");
      return;
    }

    // Backgrounding the tab/app releases the camera too (privacy/battery)
    // — but deliberately does NOT auto-reacquire on return. Foregrounding
    // lands back on the "tap to enable" prompt, same as a fresh open.
    function handleHidden() {
      if (document.visibilityState !== "visible") {
        generationRef.current++;
        release();
        setState("idle");
      }
    }

    document.addEventListener("visibilitychange", handleHidden);

    return () => {
      generationRef.current++;
      release();
      document.removeEventListener("visibilitychange", handleHidden);
    };
  }, [active]);

  function requestCamera() {
    void acquire();
  }

  const canSwitch = cameras.length > 1;

  // Resolves which enumerated device is the one genuinely streaming right
  // now, so the first switch press cycles to the *other* camera instead of
  // assuming index 0 — the initial stream is acquired via a facingMode
  // constraint, not by picking cameras[0], so enumeration order has no
  // guaranteed correspondence to "which one is live" otherwise.
  useEffect(() => {
    if (cameras.length === 0) return;
    const currentId = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
    const idx = cameras.findIndex((c) => c.id === currentId);
    if (idx >= 0) setActiveIndex(idx);
  }, [cameras]);

  // Sequenced stop-then-start (not concurrent — two simultaneous
  // getUserMedia calls on the same device risk "camera already in use").
  function switchCamera() {
    if (!canSwitch || switching) return;
    const nextIndex = (activeIndex + 1) % cameras.length;
    setSwitching(true);
    release();
    void acquire(cameras[nextIndex].id).finally(() => setSwitching(false));
    setActiveIndex(nextIndex);
  }

  return { videoRef, state, canSwitch, switching, switchCamera, requestCamera };
}
