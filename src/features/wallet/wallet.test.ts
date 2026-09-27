import { test, expect, beforeEach } from "bun:test";

// ponytail: same in-memory localStorage shim as expense.test.ts.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  clear() {
    this.store.clear();
  }
}
globalThis.localStorage = new MemoryStorage() as unknown as Storage;

const {
  readAll,
  writeAll,
  getRemoveBlockReason,
  addWalletPure,
  renameWalletPure,
  updateWalletAnimalPure,
  removeWalletPure,
} = await import("./wallet.store");
const { WALLET_MAX, DEFAULT_WALLET_NAME, WALLET_ANIMALS, randomAnimal } =
  await import("./wallet.schema");

test("randomAnimal always returns one of the known 8 icons", () => {
  for (let i = 0; i < 20; i++) {
    expect(WALLET_ANIMALS).toContain(randomAnimal());
  }
});

beforeEach(() => {
  localStorage.clear();
});

test("readAll seeds one default 'Main Wallet' on first run", () => {
  const wallets = readAll();
  expect(wallets).toHaveLength(1);
  expect(wallets[0]?.name).toBe(DEFAULT_WALLET_NAME);
});

test("readAll seeds a default wallet from corrupt/foreign localStorage data too", () => {
  localStorage.setItem("expense-notes.wallets.v1", "not json");
  expect(readAll()).toHaveLength(1);

  localStorage.setItem("expense-notes.wallets.v1", JSON.stringify([]));
  expect(readAll()).toHaveLength(1);
});

test("writeAll then readAll round-trips a wallet list", () => {
  const wallets = [
    { id: "1", name: "Cash", animal: "cat" as const },
    { id: "2", name: "Bank", animal: "dog" as const },
  ];
  writeAll(wallets);
  expect(readAll()).toEqual(wallets);
});

test("addWalletPure appends a trimmed name, rejects blank names", () => {
  const start = [{ id: "1", name: "Main", animal: "cat" as const }];
  const result = addWalletPure(start, "  Bank  ", "dog");
  expect(result.added).toBe(true);
  expect(result.wallets).toHaveLength(2);
  expect(result.wallets[1]?.name).toBe("Bank");
  expect(result.wallets[1]?.animal).toBe("dog");

  const blank = addWalletPure(start, "   ", "dog");
  expect(blank.added).toBe(false);
  expect(blank.wallets).toBe(start);
});

test("addWalletPure rejects a name that already exists (case/whitespace-insensitive)", () => {
  const start = [{ id: "1", name: "Main Wallet", animal: "cat" as const }];
  const result = addWalletPure(start, "  main wallet  ", "dog");
  expect(result.added).toBe(false);
  expect(result.wallets).toBe(start);
});

test("addWalletPure refuses past WALLET_MAX", () => {
  const full = Array.from({ length: WALLET_MAX }, (_, i) => ({
    id: String(i),
    name: `W${i}`,
    animal: "cat" as const,
  }));
  const result = addWalletPure(full, "One too many", "dog");
  expect(result.added).toBe(false);
  expect(result.wallets).toHaveLength(WALLET_MAX);
});

test("renameWalletPure trims and updates the matching wallet only", () => {
  const wallets = [
    { id: "1", name: "Main", animal: "cat" as const },
    { id: "2", name: "Bank", animal: "dog" as const },
  ];
  const next = renameWalletPure(wallets, "2", "  Savings  ");
  expect(next).toEqual([
    { id: "1", name: "Main", animal: "cat" },
    { id: "2", name: "Savings", animal: "dog" },
  ]);
});

test("renameWalletPure ignores a blank name", () => {
  const wallets = [{ id: "1", name: "Main", animal: "cat" as const }];
  expect(renameWalletPure(wallets, "1", "   ")).toBe(wallets);
});

test("updateWalletAnimalPure updates the matching wallet's icon only", () => {
  const wallets = [
    { id: "1", name: "Main", animal: "cat" as const },
    { id: "2", name: "Bank", animal: "dog" as const },
  ];
  const next = updateWalletAnimalPure(wallets, "2", "turtle");
  expect(next).toEqual([
    { id: "1", name: "Main", animal: "cat" },
    { id: "2", name: "Bank", animal: "turtle" },
  ]);
});

test("updateWalletAnimalPure no-ops when the id doesn't match any wallet", () => {
  const wallets = [{ id: "1", name: "Main", animal: "cat" as const }];
  expect(updateWalletAnimalPure(wallets, "missing", "turtle")).toEqual(wallets);
});

test("removeWalletPure refuses when it's the last remaining wallet", () => {
  const wallets = [{ id: "1", name: "Main", animal: "cat" as const }];
  const result = removeWalletPure(wallets, "1", []);
  expect(result.removed).toBe(false);
  expect(result.wallets).toEqual(wallets);
});

test("removeWalletPure refuses when an expense still references it", () => {
  const wallets = [
    { id: "1", name: "Main", animal: "cat" as const },
    { id: "2", name: "Bank", animal: "dog" as const },
  ];
  const expense = { id: "e1", walletId: "2" } as never;
  const result = removeWalletPure(wallets, "2", [expense]);
  expect(result.removed).toBe(false);
  expect(result.wallets).toEqual(wallets);
});

test("removeWalletPure succeeds once no expense references it and it's not the last one", () => {
  const wallets = [
    { id: "1", name: "Main", animal: "cat" as const },
    { id: "2", name: "Bank", animal: "dog" as const },
  ];
  const result = removeWalletPure(wallets, "2", []);
  expect(result.removed).toBe(true);
  expect(result.wallets).toEqual([{ id: "1", name: "Main", animal: "cat" }]);
});

test("getRemoveBlockReason explains why, or is null when removal is safe", () => {
  const wallets = [
    { id: "1", name: "Main", animal: "cat" as const },
    { id: "2", name: "Bank", animal: "dog" as const },
  ];
  expect(getRemoveBlockReason("1", [wallets[0]!], [])).toMatch(/at least one/);
  expect(getRemoveBlockReason("2", wallets, [{ walletId: "2" } as never])).toMatch(
    /reassign|rename/i,
  );
  expect(getRemoveBlockReason("2", wallets, [])).toBeNull();
});
