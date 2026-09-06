import { useCallback, useState } from "react";
import { z } from "zod";
import { walletSchema, WALLET_MAX, DEFAULT_WALLET_NAME, type Wallet, type WalletAnimal } from "./wallet.schema";
import type { Expense } from "@/features/expense/expense.schema";
import { scopedKey, migrateLegacyKey } from "@/lib/account-scope";

// Exported so sync.store.ts's connect() can pass it to claimAccountSlot.
export const STORAGE_KEY = "expense-notes.wallets.v1";
const storedListSchema = z.array(walletSchema);

function seedDefault(): Wallet[] {
  return [{ id: crypto.randomUUID(), name: DEFAULT_WALLET_NAME, animal: "cat" }];
}

/** A wallet list is never empty after this — first run (or corrupt/foreign
 * data) seeds one "Main Wallet" so every expense always has somewhere to
 * default to. */
export function readAll(): Wallet[] {
  try {
    migrateLegacyKey(STORAGE_KEY);
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return seedDefault();
    const parsed = storedListSchema.parse(JSON.parse(raw));
    return parsed.length > 0 ? parsed : seedDefault();
  } catch {
    return seedDefault();
  }
}

export function writeAll(wallets: Wallet[]) {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(wallets));
}

/** Why a wallet can't be removed right now, or null if it's safe to. Pure
 * check so the settings page can disable/explain the button before the
 * user even taps it, not just reject after. */
export function getRemoveBlockReason(id: string, wallets: Wallet[], expenses: Expense[]): string | null {
  if (wallets.length <= 1) return "You need at least one wallet.";
  if (expenses.some((e) => e.walletId === id)) {
    return "Delete or reassign this wallet's expenses first, or rename it instead.";
  }
  return null;
}

// Pure list-transform helpers, kept separate from the hook below so they're
// directly testable without a React render harness (this repo doesn't have
// one — see expense.test.ts, which only exercises expense.store.ts's plain
// readAll/writeAll the same way).
export function addWalletPure(
  wallets: Wallet[],
  name: string,
  animal: WalletAnimal,
): { wallets: Wallet[]; added: boolean; wallet?: Wallet } {
  const trimmed = name.trim();
  if (!trimmed || wallets.length >= WALLET_MAX) return { wallets, added: false };
  if (wallets.some((w) => w.name.toLowerCase() === trimmed.toLowerCase())) return { wallets, added: false };
  const wallet: Wallet = { id: crypto.randomUUID(), name: trimmed, animal };
  return { wallets: [...wallets, wallet], added: true, wallet };
}

export function renameWalletPure(wallets: Wallet[], id: string, name: string): Wallet[] {
  const trimmed = name.trim();
  if (!trimmed) return wallets;
  return wallets.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
}

export function updateWalletAnimalPure(wallets: Wallet[], id: string, animal: WalletAnimal): Wallet[] {
  return wallets.map((w) => (w.id === id ? { ...w, animal } : w));
}

export function removeWalletPure(
  wallets: Wallet[],
  id: string,
  expenses: Expense[],
): { wallets: Wallet[]; removed: boolean } {
  if (getRemoveBlockReason(id, wallets, expenses)) return { wallets, removed: false };
  return { wallets: wallets.filter((w) => w.id !== id), removed: true };
}

export function useWallets() {
  const [wallets, setWallets] = useState<Wallet[]>(() => readAll());

  const addWallet = useCallback((name: string, animal: WalletAnimal) => {
    let result: { added: boolean; wallet?: Wallet } = { added: false };
    setWallets((prev) => {
      const outcome = addWalletPure(prev, name, animal);
      result = outcome;
      if (outcome.added) writeAll(outcome.wallets);
      return outcome.wallets;
    });
    return result;
  }, []);

  const renameWallet = useCallback((id: string, name: string) => {
    let updated: Wallet | undefined;
    setWallets((prev) => {
      const next = renameWalletPure(prev, id, name);
      updated = next.find((w) => w.id === id);
      writeAll(next);
      return next;
    });
    return updated;
  }, []);

  const updateWalletAnimal = useCallback((id: string, animal: WalletAnimal) => {
    let updated: Wallet | undefined;
    setWallets((prev) => {
      const next = updateWalletAnimalPure(prev, id, animal);
      updated = next.find((w) => w.id === id);
      writeAll(next);
      return next;
    });
    return updated;
  }, []);

  const removeWallet = useCallback((id: string, expenses: Expense[]) => {
    let removed = false;
    setWallets((prev) => {
      const result = removeWalletPure(prev, id, expenses);
      removed = result.removed;
      if (result.removed) writeAll(result.wallets);
      return result.wallets;
    });
    return removed;
  }, []);

  return { wallets, addWallet, renameWallet, updateWalletAnimal, removeWallet, setWallets };
}
