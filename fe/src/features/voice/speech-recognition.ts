// Thin wrapper over the browser's native SpeechRecognition (Web Speech API)
// — no library, per the `ponytail:` note this replaces in VoiceEntry.tsx.
// Support is inconsistent (Chrome/Edge/Safari yes, Firefox no) — callers
// must check isSpeechRecognitionSupported() and fall back to typing.

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: { [index: number]: SpeechRecognitionAlternativeLike };
}
interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Every iOS browser (Safari, Chrome iOS, etc.) wraps the same WebKit
// engine — same pattern as LiveCameraCapture.tsx's detectCameraBrowser.
// WebKit exposes the webkitSpeechRecognition constructor (getCtor()
// below would say "supported") but never actually produces a transcript
// there: confirmed on-device to end silently with no result, or abort
// with no visible feedback at all. Treat iOS as unsupported outright so
// voice entry routes straight to the Cloudflare mic-recording fallback
// instead of hitting this broken tier first every time.
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && !isIOS() && getCtor() !== null;
}

export interface SpeechRecognizer {
  start(): void;
  stop(): void;
}

export function createSpeechRecognizer(
  lang: string,
  handlers: { onResult: (transcript: string) => void; onError: (error: string) => void; onEnd: () => void },
): SpeechRecognizer | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    const transcript = last?.[0]?.transcript.trim();
    if (transcript) handlers.onResult(transcript);
  };
  recognition.onerror = (event) => handlers.onError(event.error);
  recognition.onend = () => handlers.onEnd();

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
