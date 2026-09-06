import { test, expect, beforeEach } from "bun:test";
import type { Expense } from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";

// ponytail: same in-memory localStorage shim as expense.test.ts/wallet.test.ts.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
globalThis.localStorage = new MemoryStorage() as unknown as Storage;

const { readQueue, enqueue, clearQueue } = await import("./sync-queue");
const EXPENSE = { id: "e1", title: "Coffee", amount: 20000 } as unknown as Expense;
const WALLET = { id: "w1", name: "Main Wallet" } as unknown as Wallet;

beforeEach(() => {
  localStorage.clear();
});

test("enqueue appends a new op", () => {
  enqueue({ type: "upsertExpense", expense: EXPENSE });
  expect(readQueue()).toEqual([{ type: "upsertExpense", expense: EXPENSE }]);
});

test("enqueue collapses a later upsert for the same expense id, keeping only the latest", () => {
  enqueue({ type: "upsertExpense", expense: EXPENSE });
  const updated = { ...EXPENSE, title: "Coffee (large)" };
  enqueue({ type: "upsertExpense", expense: updated });
  expect(readQueue()).toEqual([{ type: "upsertExpense", expense: updated }]);
});

test("enqueue lets a delete replace an earlier queued upsert for the same id", () => {
  enqueue({ type: "upsertExpense", expense: EXPENSE });
  enqueue({ type: "deleteExpense", id: EXPENSE.id });
  expect(readQueue()).toEqual([{ type: "deleteExpense", id: EXPENSE.id }]);
});

test("enqueue keeps expense and wallet ops separate even when ids collide", () => {
  enqueue({ type: "upsertExpense", expense: { ...EXPENSE, id: "shared-id" } });
  enqueue({ type: "upsertWallet", wallet: { ...WALLET, id: "shared-id" } });
  expect(readQueue()).toHaveLength(2);
});

test("clearQueue empties it", () => {
  enqueue({ type: "upsertWallet", wallet: WALLET });
  clearQueue();
  expect(readQueue()).toEqual([]);
});

test("readQueue self-heals on corrupt data instead of throwing", () => {
  localStorage.setItem("expense-notes.sync-queue.v1", "not json");
  expect(readQueue()).toEqual([]);
});
