import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  type SpeechRecognizer,
} from "@/features/voice/speech-recognition";
import {
  startRecording,
  isMicRecordingSupported,
  warmUpMicPermission,
  type AudioRecording,
} from "@/features/voice/audio-capture";
import { transcribeViaCloudflare } from "@/features/voice/cloudflare-stt";
import { parseVoiceExpense } from "@/features/expense/voice.api";
import { QuotaExceededError } from "@/features/receipt/receipt.api";
import { getQuota, recordQuota } from "@/lib/entry-quota";
import type { Receipt } from "@/features/receipt/receipt.schema";
import { localDateKey } from "@/lib/format";

// A translation key, not literal prose — this hook has no reactive access
// to the current app language, so it hands back a stable key and lets the
// caller (VoiceEntry.tsx, which has `lang`) translate it. Same pattern as
// useReceiptScanner.ts's error messages.
type VoiceErrorKey =
  | "voiceErrorUnsupported"
  | "voiceErrorMicBlocked"
  | "voiceErrorParseFailed"
  | "voiceErrorTranscribeFailed"
  | "voiceErrorGeneric"
  | "voiceErrorUnclear"
  | "voiceErrorQuotaExceeded"
  | "voiceErrorNoSpeech";

type VoiceState =
  | { status: "idle"; result: null; message?: undefined; detail?: undefined }
  | { status: "recording"; result: null; message?: undefined; detail?: undefined }
  | { status: "transcribing"; result: null; message?: undefined; detail?: undefined }
  | { status: "parsing"; result: null; message?: undefined; detail?: undefined }
  | { status: "success"; result: Receipt; message?: undefined; detail?: undefined }
  | { status: "error"; result: null; message: VoiceErrorKey; detail?: string };

export type VoiceExpenseStatus = VoiceState["status"];

const IDLE: VoiceState = { status: "idle", result: null };

// Any native SpeechRecognitionErrorEvent (other than the user's own
// "aborted") now silently triggers the fallback instead of surfacing a
// native-specific message: record once and try the Cloudflare Workers AI
// Whisper endpoint (network, but works everywhere native doesn't — this is
// what actually fixes browsers like Dia, whose native STT is blocked by a
// Google-key-gated backend, not a real network problem). No further local
// fallback beyond that tier — see the commit removing the old WASM Whisper
// path once Cloudflare STT covered the same need.

/** Maps the UI's BCP-47 toggle value to what the Cloudflare STT endpoint's `language` option expects. */
const toWhisperLanguage = (lang: string): "english" | "indonesian" =>
  lang.toLowerCase().startsWith("id") ? "indonesian" : "english";

/** Same toggle value, but the short code the expense-parse endpoint's `language` hint expects. */
const toLanguageCode = (lang: string): "en" | "id" =>
  toWhisperLanguage(lang) === "indonesian" ? "id" : "en";

/**
 * Orchestration layer for voice entry, same shape as useReceiptScanner —
 * plus a 2-tier hybrid: native SpeechRecognition first (instant, zero
 * download); if that's unsupported or errors (anything but the user's own
 * "aborted"), record once and transcribe via Cloudflare Workers AI Whisper.
 * Both hand a plain transcript to the same parseVoiceExpense.
 */
export const useVoiceExpense = (lang: string) => {
  const [state, setState] = useState<VoiceState>(IDLE);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const fallbackRecordingRef = useRef<AudioRecording | null>(null);
  // Set synchronously, before any await — fallbackRecordingRef is only
  // assigned *after* startRecording()'s mic-access await resolves, which
  // is too late: native's own onEnd commonly fires before that resolves,
  // so a ref-based guard checked there would still see null and wrongly
  // reset to idle mid-fallback. This one is true the instant the fallback
  // starts, regardless of how long mic setup takes.
  const fallingBackRef = useRef(false);

  // Fired once, right when the Voice entry screen mounts (see
  // VoiceEntry.tsx/App.tsx — this hook only exists while that screen is
  // open) — not from the record button. The record button is
  // press-and-hold; a native mic-permission dialog appearing mid-hold
  // forces the user to lift their finger to respond to it, orphaning the
  // hold gesture (nothing left to fire the stop). Settling permission
  // up front means that dialog, if any, only ever appears before the
  // user starts holding.
  useEffect(() => {
    void warmUpMicPermission();
  }, []);

  const runParse = useCallback(
    (transcript: string) => {
      setState({ status: "parsing", result: null });
      const referenceDate = localDateKey();
      void parseVoiceExpense(transcript, referenceDate, toLanguageCode(lang))
        .then((response) => {
          recordQuota("voice", response.quota);
          // A zero total means the model had nothing real to parse —
          // reads the same as an unreadable receipt: ask to retry rather
          // than open the review modal on a meaningless result.
          if (!response.data.total) {
            setState({ status: "error", result: null, message: "voiceErrorUnclear" });
            return;
          }
          setState({ status: "success", result: response.data });
        })
        .catch((error: unknown) => {
          console.error("Voice expense parse failed", error);
          if (error instanceof QuotaExceededError) {
            recordQuota("voice", { remaining: 0, limit: getQuota("voice")?.limit ?? 20 });
            setState({ status: "error", result: null, message: "voiceErrorQuotaExceeded" });
            return;
          }
          setState({
            status: "error",
            result: null,
            message: "voiceErrorParseFailed",
            detail: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [lang],
  );

  const startFallback = useCallback(async () => {
    fallingBackRef.current = true;
    if (!isMicRecordingSupported()) {
      fallingBackRef.current = false;
      setState({
        status: "error",
        result: null,
        message: "voiceErrorUnsupported",
        detail: "getUserMedia not available",
      });
      return;
    }
    try {
      fallbackRecordingRef.current = await startRecording();
      setState({ status: "recording", result: null });
    } catch (error) {
      fallingBackRef.current = false;
      console.error("Microphone access failed", error);
      setState({
        status: "error",
        result: null,
        message: "voiceErrorMicBlocked",
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
    }
  }, []);

  const stopFallback = useCallback(async () => {
    const recording = fallbackRecordingRef.current;
    fallbackRecordingRef.current = null;
    if (!recording) return;

    setState({ status: "transcribing", result: null });
    const clip = await recording.stop().catch((error: unknown) => {
      console.error("Recording failed", error);
      return null;
    });
    if (!clip) {
      // Too little was captured (near-instant tap/no real speech).
      setState({
        status: "error",
        result: null,
        message: "voiceErrorGeneric",
        detail: "clip: null (stop() rejected or under 300ms)",
      });
      return;
    }

    try {
      const transcript = await transcribeViaCloudflare(clip, toWhisperLanguage(lang));
      if (!transcript) {
        // Server-side VAD already filtered silence.
        setState({
          status: "error",
          result: null,
          message: "voiceErrorGeneric",
          detail: `clip: ${clip.size}B type=${clip.type || "unknown"}, server returned empty transcript`,
        });
        return;
      }
      runParse(transcript);
    } catch (error) {
      console.error("Cloudflare STT failed", error);
      setState({
        status: "error",
        result: null,
        message: "voiceErrorTranscribeFailed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }, [runParse, lang]);

  const start = useCallback(() => {
    fallingBackRef.current = false;
    if (!isSpeechRecognitionSupported()) {
      void startFallback();
      return;
    }

    const recognizer = createSpeechRecognizer(lang, {
      onResult: runParse,
      onError: (error) => {
        // "aborted" fires on the user's own stop() call — expected, not a
        // failure. Drop back to idle silently instead of flashing an error.
        if (error === "aborted") {
          setState(IDLE);
          return;
        }
        console.error("Speech recognition failed, trying the Cloudflare STT fallback", error);
        void startFallback();
      },
      // Recognition can end (e.g. silence/timeout) without ever firing
      // onresult/onerror — a real, common case on Chrome/Android, not
      // just a theoretical one. Only act if we're still waiting on it, so
      // this doesn't clobber a state either of those already moved past.
      // Browsers commonly fire onend right alongside/after onerror when
      // native recognition fails, typically *before* startFallback()'s
      // mic-access await has resolved — fallbackRecordingRef isn't set yet
      // at that point, so checking it here doesn't help. fallingBackRef is
      // set synchronously the instant the fallback starts, so it's already
      // true by the time onEnd fires, closing that gap.
      //
      // This used to silently reset to idle — from the user's side that
      // looks exactly like "I held the button, spoke, let go, and nothing
      // happened," no different from the app being broken. Surface it as
      // an actual error instead, same as every other failure path here.
      onEnd: () =>
        setState((prev) =>
          prev.status === "recording" && !fallingBackRef.current
            ? {
                status: "error",
                result: null,
                message: "voiceErrorNoSpeech",
                detail: "native recognition ended with no result",
              }
            : prev,
        ),
    });

    if (!recognizer) {
      void startFallback();
      return;
    }

    recognizerRef.current = recognizer;
    setState({ status: "recording", result: null });
    recognizer.start();
  }, [lang, startFallback, runParse]);

  const stop = useCallback(() => {
    if (fallbackRecordingRef.current) {
      void stopFallback();
      return;
    }
    recognizerRef.current?.stop();
  }, [stopFallback]);

  const reset = useCallback(() => {
    fallingBackRef.current = false;
    setState(IDLE);
  }, []);

  return {
    ...state,
    start,
    stop,
    reset,
    supported: isSpeechRecognitionSupported() || isMicRecordingSupported(),
    nativeSupported: isSpeechRecognitionSupported(),
  };
};
