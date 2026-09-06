// Middle tier of the voice-entry hybrid — a thin POST to the BE's Workers AI
// Whisper endpoint, between native SpeechRecognition and the WASM fallback
// (see useVoiceExpense.ts). Same account/BE the app already talks to for
// receipt/expense parsing, no new vendor.
import { RECEIPT_API_URL, RECEIPT_API_KEY } from "@/config/env";
import { sheetIdentityHeaders } from "@/features/sync/sheets-sync.api";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** POSTs a recorded clip to /v1/voice/transcribe; throws on any non-2xx (caller falls through to WASM). */
export async function transcribeViaCloudflare(blob: Blob, language: "english" | "indonesian"): Promise<string> {
  const audio = await blobToBase64(blob);
  const response = await fetch(`${RECEIPT_API_URL}/v1/voice/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RECEIPT_API_KEY}`,
      ...sheetIdentityHeaders(),
    },
    body: JSON.stringify({ audio, language: language === "indonesian" ? "id" : "en" }),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare STT failed: ${response.status}`);
  }

  const json = (await response.json()) as { data: { text: string } };
  return json.data.text.trim();
}
