import { localDateKey } from "./format";

/** Scan/Voice/pasted-text-receipt each meter against their own daily cap —
 * see text-processing-slm/src/middleware/identity-quota.ts. */
export type QuotaGroup = "scan" | "voice" | "text";
export interface Quota {
  remaining: number;
  limit: number;
}

const STORAGE_KEY = "expense-notes.entry-quota.v1";
type Stored = { date: string } & Partial<Record<QuotaGroup, Quota>>;

function readStored(): Stored {
  const today = localDateKey();
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (!raw) return { date: today };
  try {
    const parsed = JSON.parse(raw) as Stored;
    // ponytail: corrupt/foreign/yesterday's data just resets, never crashes
    // the app — same convention as expense.store.ts's readAll().
    return parsed.date === today ? parsed : { date: today };
  } catch {
    return { date: today };
  }
}

let cache = readStored();
const listeners = new Set<() => void>();

/** Only ever the BE's own numbers, cached for display/pre-emptive gating —
 * never independently incremented client-side, so it can't drift from what
 * the server actually enforces. Returns undefined once the day rolls over
 * or before the first call of the day, meaning "unknown yet, don't block,
 * don't show a badge." */
export function getQuota(group: QuotaGroup): Quota | undefined {
  return cache.date === localDateKey() ? cache[group] : undefined;
}

export function recordQuota(group: QuotaGroup, quota: Quota | undefined) {
  if (!quota || typeof localStorage === "undefined") return;
  cache = { ...readStored(), date: localDateKey(), [group]: quota };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  listeners.forEach((l) => l());
}

export function subscribeQuota(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
