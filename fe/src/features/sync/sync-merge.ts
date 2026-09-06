// Pure merge/dedupe helpers for sync — no React/localStorage/fetch deps,
// kept directly testable without a render harness (see sync.test.ts).
import { DEFAULT_WALLET_NAME, type Wallet } from "@/features/wallet/wallet.schema";
import type { Expense } from "@/features/expense/expense.schema";

/** Union by id, sheet's copy wins on a collision (it's the more
 * authoritative side once a device is actively connecting/reconnecting).
 * Exported for direct testing — no React render harness in this repo, see
 * wallet.store.ts's addWalletPure/etc. for the same reasoning. */
export function mergeById<T extends { id: string }>(sheetItems: T[], localItems: T[]): T[] {
  const sheetIds = new Set(sheetItems.map((i) => i.id));
  return [...sheetItems, ...localItems.filter((i) => !sheetIds.has(i.id))];
}

/** Whether this device has anything worth merging, vs. just the untouched
 * default wallet every fresh device auto-seeds — used to tell "this device
 * had standalone data before connecting" apart from "this device is simply
 * joining an already-connected account" (the common multi-device case),
 * which should be a pure pull, not a merge (a naive id-merge would show a
 * duplicate "Main Wallet" — same name, different id, from each side). */
export function hasRealLocalData(expenses: Expense[], wallets: Wallet[]): boolean {
  if (expenses.length > 0) return true;
  if (wallets.length > 1) return true;
  return wallets.length === 1 && wallets[0]!.name !== DEFAULT_WALLET_NAME;
}

/** Sheet-wins merge for the trailing-window recent-pull (see sync.store.ts's
 * pullRecentAndMerge): everything in `local` dated before `cutoff` (a
 * "YYYY-MM-DD" key, string-comparable since that format sorts the same
 * lexicographically and chronologically) is left untouched; everything
 * from `cutoff` onward is replaced wholesale by whatever `recent` (the
 * sheet's own windowed pull) contains — covers both another device having
 * added/edited something in the window and another device having deleted
 * something in it (a sheet-side delete just isn't in `recent` to begin
 * with). Exported for direct testing, same reasoning as mergeById above. */
export function mergeRecentWindow(local: Expense[], recent: Expense[], cutoff: string): Expense[] {
  return [...local.filter((e) => e.date < cutoff), ...recent];
}

/** Collapses wallets sharing a name (trimmed, case-insensitive) down to the
 * first occurrence, remapping any expense's walletId off a dropped
 * duplicate onto the survivor. Each device auto-seeds its own default
 * "Main Wallet" with its own random id (see wallet.store.ts's
 * seedDefault), so mergeById alone lets two distinct-id, same-name
 * wallets survive a merge — this is what actually collapses them back
 * into one, both before pushing to the sheet and as a local self-heal.
 * No-ops (returns the same references) when nothing collides. */
export function dedupeWalletsByName(
  wallets: Wallet[],
  expenses: Expense[],
): { wallets: Wallet[]; expenses: Expense[] } {
  const survivorIdByName = new Map<string, string>();
  const idRemap = new Map<string, string>();
  const deduped: Wallet[] = [];
  for (const w of wallets) {
    const key = w.name.trim().toLowerCase();
    const survivorId = survivorIdByName.get(key);
    if (survivorId === undefined) {
      survivorIdByName.set(key, w.id);
      deduped.push(w);
    } else if (survivorId !== w.id) {
      idRemap.set(w.id, survivorId);
    }
  }
  if (idRemap.size === 0) return { wallets, expenses };
  return {
    wallets: deduped,
    expenses: expenses.map((e) => (e.walletId && idRemap.has(e.walletId) ? { ...e, walletId: idRemap.get(e.walletId) } : e)),
  };
}
