// Mic capture for the Cloudflare STT fallback tier (see useVoiceExpense.ts)
// — records once via MediaRecorder and hands back the raw blob as-is,
// posted directly to the Cloudflare Whisper endpoint. No local decode/
// resample needed now that the WASM Whisper tier is gone.

// Near-instant tap/no real speech guard — was based on decoded PCM sample
// count back when this also fed a local Whisper model; without that
// decode step, elapsed wall-clock time is the simpler equivalent.
const MIN_DURATION_MS = 300;
// A freshly granted mic stream can report acquired while still silent for
// a short window before hardware actually goes live — most visible right
// after a previous consumer of the mic (a just-failed native
// SpeechRecognition attempt, which also holds the mic before erroring
// into this fallback) has only just released it. Same class of race as
// the iOS "ended track" workaround in useCameraStream.ts. Starting to
// record immediately risks capturing mostly/only silence for a short
// utterance, which the server's VAD then correctly but unhelpfully
// reports back as "didn't catch that."
const MIC_SETTLE_DELAY_MS = 200;

export interface AudioRecording {
  /** Stops recording and resolves with the captured clip, or null if too little was captured. */
  stop(): Promise<Blob | null>;
}

export const isMicRecordingSupported = (): boolean => {
  return !!navigator.mediaDevices?.getUserMedia;
};

/** Requests mic permission once, up front, and immediately releases it —
 * call this as soon as the voice-entry UI opens (not from the record
 * button itself). A press-and-hold gesture can't survive a native
 * permission dialog appearing mid-hold (the user has to lift their
 * finger to respond to it, orphaning whatever was being held) —
 * pre-warming here means that dialog, if any, appears before the user
 * ever starts holding, not during. */
export const warmUpMicPermission = async (): Promise<void> => {
  if (!isMicRecordingSupported()) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch {
    // Denied/unavailable — surfaces properly later via the real
    // recording attempt's own error handling; nothing to do here.
  }
};

/** Starts recording the mic; call stop() to get back the recorded clip. */
export const startRecording = async (): Promise<AudioRecording> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  await new Promise((resolve) => setTimeout(resolve, MIC_SETTLE_DELAY_MS));

  const startedAt = Date.now();
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  return {
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => {
          for (const track of stream.getTracks()) track.stop();
          const tooShort = Date.now() - startedAt < MIN_DURATION_MS;
          resolve(tooShort ? null : new Blob(chunks, { type: recorder.mimeType }));
        };
        recorder.stop();
      }),
  };
};
