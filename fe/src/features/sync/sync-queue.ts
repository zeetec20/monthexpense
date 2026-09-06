// Pending-mutation queue for incremental sync — pure localStorage read/write,
// no React/fetch (same shape as sync-merge.ts). Lets a create/edit/delete
// survive an app reload while offline, then get replayed as one small
// "mutate" batch once back online (see sync.store.ts).
import type { SyncOp } from "./sheets-sync.api";
import { scopedKey, migrateLegacyKey } from "@/lib/account-scope";

// A restore-from-sheets request rides this same queue (see sync.store.ts's
// flushQueue/enqueueRestore) — a pull+merge, not a push, but it gets the
// exact same persistence/order/retry-on-failure/resume-on-next-open for
// free instead of the standalone one-shot-and-give-up it used to be.
export type QueuedOp = SyncOp | { type: "restoreFromSheets" };

// Exported so sync.store.ts's connect() can pass it to claimAccountSlot.
export const STORAGE_KEY = "expense-notes.sync-queue.v1";

function targetKey(op: QueuedOp): string {
  switch (op.type) {
    case "upsertExpense":
      return `expense:${op.expense.id}`;
    case "deleteExpense":
      return `expense:${op.id}`;
    case "upsertWallet":
      return `wallet:${op.wallet.id}`;
    case "deleteWallet":
      return `wallet:${op.id}`;
    case "restoreFromSheets":
      return "restore";
  }
}

export function readQueue(): QueuedOp[] {
  try {
    migrateLegacyKey(STORAGE_KEY);
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedOp[]) : [];
  } catch {
    // ponytail: corrupt/foreign localStorage data just resets the queue, never crashes
    return [];
  }
}

export function writeQueue(ops: QueuedOp[]): void {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(ops));
}

export function clearQueue(): void {
  localStorage.removeItem(scopedKey(STORAGE_KEY));
}

/** Appends `op`, collapsing any earlier queued op for the same target —
 * only the latest state of a given expense/wallet matters once it's
 * finally flushed (a delete right after an unsent upsert should just
 * delete; a second edit should replace the first, not send both). Same
 * dedupe collapses repeated restore clicks onto the one already pending,
 * since every restore shares the fixed `"restore"` target key. */
export function enqueue(op: QueuedOp): void {
  const queue = readQueue().filter((existing) => targetKey(existing) !== targetKey(op));
  queue.push(op);
  writeQueue(queue);
}
