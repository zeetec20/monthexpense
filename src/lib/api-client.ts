import { hc } from "hono/client";
import type { AppType } from "@/worker";
import { RECEIPT_API_URL } from "@/config/env";

// In production, the app is same-origin with the Hono worker.
// RECEIPT_API_URL can optionally override this (e.g. for remote testing in dev).
const baseUrl =
  RECEIPT_API_URL ||
  (typeof window !== "undefined" && window.location.origin ? window.location.origin : "");

export const client = hc<AppType>(baseUrl);
