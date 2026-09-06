// Namespaces a device's local data by which Google account is currently
// connected, so switching to a different email never auto-merges the
// previous account's leftover local expenses/wallets/pending-sync-ops into
// the new one's spreadsheet (see sync.store.ts's connect()). Before this,
// every account on a device shared one global localStorage blob.
const POINTER_KEY = "expense-notes.active-account.v1";

/** Slot used before any account has ever connected on this device, and for
 * anyone who never connects at all — the offline-first "local only" mode
 * keeps working exactly as before, just technically namespaced now. */
const ANONYMOUS_SLOT = "__local__";

function readPointer(): string | null {
  try {
    return localStorage.getItem(POINTER_KEY);
  } catch {
    return null;
  }
}

function currentSlot(): string {
  return readPointer() || ANONYMOUS_SLOT;
}

/** Every per-account store key should be built with this instead of a bare
 * literal — see expense.store.ts/wallet.store.ts/sync-queue.ts/sync.store.ts.
 * Evaluated fresh on every call (no caching), so a slot change mid-session
 * (claimAccountSlot below) takes effect immediately on the next read/write. */
export function scopedKey(base: string): string {
  return `${base}.${currentSlot()}`;
}

/** One-time legacy fallback: a key written before this namespacing existed
 * has no slot suffix at all. Called by each store's readAll() so existing
 * users' data quietly moves under the current slot on first read instead
 * of appearing to vanish when this ships. No-ops once migrated, or if
 * there was nothing to migrate, or if the scoped key already has data
 * (never overwrites). */
export function migrateLegacyKey(base: string): void {
  try {
    const legacy = localStorage.getItem(base);
    if (legacy === null) return;
    const scoped = scopedKey(base);
    if (localStorage.getItem(scoped) !== null) return;
    localStorage.setItem(scoped, legacy);
    localStorage.removeItem(base);
  } catch {
    // ponytail: best-effort — worst case the legacy key just gets rechecked next read
  }
}

/**
 * Claims this device's per-account slot for `email` — called once per
 * successful connect() (sync.store.ts), before any "local data" is read
 * for the merge decision. If no account has ever been claimed on this
 * device yet, carries the anonymous slot's data over to the new email's
 * slot first (preserves the existing "merge my pre-connect local data into
 * my first sheet" UX — see hasRealLocalData in sync-merge.ts). A
 * *different* email than whatever was last claimed here gets its own slot
 * instead (empty the first time, or its own previous data if it's been
 * used on this device before) — never the old email's.
 */
export function claimAccountSlot(email: string, migrateKeysOnFirstClaim: string[]): void {
  const slug = email.trim().toLowerCase();
  if (!slug) return;
  const previous = readPointer();
  if (previous === null) {
    for (const base of migrateKeysOnFirstClaim) {
      try {
        const anonymousKey = `${base}.${ANONYMOUS_SLOT}`;
        const targetKey = `${base}.${slug}`;
        const raw = localStorage.getItem(anonymousKey);
        if (raw !== null && localStorage.getItem(targetKey) === null) {
          localStorage.setItem(targetKey, raw);
          localStorage.removeItem(anonymousKey);
        }
      } catch {
        // ponytail: best-effort per key — a failure here just means that
        // one key stays in the anonymous slot instead of migrating
      }
    }
  }
  try {
    localStorage.setItem(POINTER_KEY, slug);
  } catch {
    // ponytail: if localStorage writes are failing here, nothing downstream works either
  }
}
