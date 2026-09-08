import { useRef, useState } from "react";
import { Camera, CameraOff, ImageIcon, Loader2, SwitchCamera, X } from "lucide-react";
import { useCameraStream } from "@/hooks/useCameraStream";
import { t, type Lang, type TKey } from "@/i18n/translations";

interface LiveCameraCaptureProps {
  onCapture: (file: File) => void;
  disabled?: boolean;
  /** Whether the Scan drawer this sits in is actually open — drives the
   * camera stream directly instead of relying on this component's own
   * mount/unmount, since the drawer's exit animation can unmount it
   * later than the user's close tap (or not promptly at all on some
   * browsers). See useCameraStream. */
  active: boolean;
  lang: Lang;
  /** Lets the drawer this sits in grow tall only while actually
   * expanded, instead of always reserving that height (see Scanner.tsx/
   * App.tsx's Scan BottomSheet). */
  onExpandChange?: (expanded: boolean) => void;
}

// No @/i18n string differs per browser beyond what's already parameterized
// below — keeping this detector local since it's UA-sniffing for one
// narrow purpose (which unblock-camera steps apply), not a general
// browser-capability check like usePwaInstall.ts's variant detection
// (which is mobile-install-specific and returns the wrong set of options
// for this).
type CameraBrowser = "chrome" | "firefox" | "safariMac" | "ios" | "other";
const detectCameraBrowser = (): CameraBrowser => {
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios"; // every iOS browser shares WebKit's permission UI, lives in the iOS Settings app
  if (/Firefox/.test(ua)) return "firefox";
  if (/Chrome|Chromium|Edg/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safariMac";
  return "other";
};
const BLOCKED_INSTRUCTION_KEY: Record<CameraBrowser, TKey> = {
  chrome: "cameraBlockedChrome",
  firefox: "cameraBlockedFirefox",
  safariMac: "cameraBlockedSafariMac",
  ios: "cameraBlockedIos",
  other: "cameraBlockedOther",
};

/** Small live preview that expands in place to ~80dvh (still inside the
 * Scan drawer, which already caps at 85vh — not a separate fullscreen
 * overlay) — replaces the old capture="environment" file input, which
 * jumped straight into the OS camera app with no in-page preview and no
 * way to pick an existing photo from the same control. Keeps a separate
 * camera-less file input for gallery/file-browse (works the same on
 * mobile and desktop, since `capture` never applies on desktop anyway). */
export const LiveCameraCapture = ({
  onCapture,
  disabled,
  active,
  lang,
  onExpandChange,
}: LiveCameraCaptureProps) => {
  const { videoRef, state, canSwitch, switching, switchCamera, requestCamera } =
    useCameraStream(active);
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const setExpandedAndNotify = (next: boolean) => {
    setExpanded(next);
    onExpandChange?.(next);
  };

  const handleShutter = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setFlash(true);
        setTimeout(() => setFlash(false), 150);
        onCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
        setExpandedAndNotify(false);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <canvas ref={canvasRef} className="hidden" />

      <div
        className={
          "relative w-full overflow-hidden bg-[var(--color-paper-2)] transition-all duration-300 " +
          (expanded
            ? "h-[78dvh] w-[calc(100%+3rem)] -mx-6 rounded-[var(--radius-card)]"
            : "aspect-[3/4] max-w-64 rounded-[var(--radius-card)] border border-[var(--color-rule)]")
        }
      >
        {/* Always mounted, never swapped out — a <video> that only exists
            once `state === "ready"` never gets a chance to receive
            srcObject in the first place, since the stream-acquire effect
            runs before that conditional ever renders it. */}
        <video ref={videoRef} muted autoPlay playsInline className="size-full object-cover" />

        {state === "idle" && (
          <button
            type="button"
            disabled={disabled}
            onClick={requestCamera}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--color-paper-2)] px-4 text-[var(--color-ink-3)] disabled:opacity-50"
          >
            <Camera className="size-6" />
            <span className="text-center text-xs font-medium">
              {t(lang, "scannerEnableCamera")}
            </span>
          </button>
        )}

        {state !== "ready" && state !== "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--color-paper-2)] px-4 text-[var(--color-ink-3)]">
            {state === "requesting" && (
              <>
                <Loader2 className="size-6 animate-spin" />
                <span className="text-center text-xs">{t(lang, "cameraRequesting")}</span>
              </>
            )}
            {state === "unavailable" && (
              <>
                <CameraOff className="size-6" />
                <span className="text-center text-xs">{t(lang, "cameraUnavailable")}</span>
              </>
            )}
            {state === "denied" && (
              <>
                <CameraOff className="size-6" />
                <span className="text-center text-xs font-semibold">
                  {t(lang, "cameraBlockedTitle")}
                </span>
                <span className="text-center text-[11px] leading-relaxed">
                  {t(lang, BLOCKED_INSTRUCTION_KEY[detectCameraBrowser()])}
                </span>
              </>
            )}
          </div>
        )}

        {state === "ready" && !expanded && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setExpandedAndNotify(true)}
            className="absolute inset-0 flex items-end disabled:opacity-50"
          >
            <span className="w-full bg-black/50 py-1 text-center text-[11px] font-medium text-white">
              {t(lang, "scannerTapToOpenCamera")}
            </span>
          </button>
        )}

        {state === "ready" && expanded && (
          <>
            {flash && <div className="absolute inset-0 bg-white" />}
            <button
              type="button"
              onClick={() => setExpandedAndNotify(false)}
              className="absolute left-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/40 text-white"
            >
              <X className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleShutter}
              className="absolute bottom-4 left-1/2 size-16 -translate-x-1/2 rounded-full border-4 border-white bg-white/20 active:bg-white/40"
            />
            {canSwitch && (
              <button
                type="button"
                disabled={switching}
                onClick={switchCamera}
                aria-label={t(lang, "cameraSwitchLabel")}
                className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-60"
              >
                <SwitchCamera className="size-4" />
              </button>
            )}
          </>
        )}
      </div>

      {!expanded && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onCapture(file);
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)] disabled:opacity-50"
          >
            <ImageIcon className="size-3.5" />
            {t(lang, "scannerChoosePhoto")}
          </button>
        </>
      )}
    </div>
  );
};
