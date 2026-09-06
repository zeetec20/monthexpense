export const RECEIPT_API_URL = import.meta.env.VITE_RECEIPT_API_URL;
export const RECEIPT_API_KEY = import.meta.env.VITE_RECEIPT_API_KEY;

// Public — an OAuth client_id is not a secret. No client_secret exists
// anywhere in this flow at all: this app talks to Google directly via
// Identity Services (see features/sync/google-auth.ts) and does its own
// provisioning (google-provision.client.ts); BE only decrypts the email
// this app sends it (text-processing-slm's lib/email-cipher.ts) — it
// never sees this client_id or anything Google-signed.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
