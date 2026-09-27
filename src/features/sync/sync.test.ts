import { test, expect, mock, afterEach, beforeEach } from "bun:test";

// ponytail: same in-memory localStorage shim as expense.test.ts/wallet.test.ts.
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

// No `window`/GIS in bun test — pullRecent (behind pullAndMergeRestore)
// goes through getFreshAccessToken (google-auth.ts), which needs a real
// browser. Stub it — see sheets-sync.test.ts for the same reasoning.
mock.module("./google-auth", () => ({ getFreshAccessToken: async () => "test-access-token" }));

const { readAll: readExpenses, writeAll: writeAllExpenses } =
  await import("@/features/expense/expense.store");
const { readAll: readWallets, writeAll: writeAllWallets } =
  await import("@/features/wallet/wallet.store");
const { DEFAULT_WALLET_NAME } = await import("@/features/wallet/wallet.schema");
const { writeCredentials } = await import("./sheets-sync.api");
const { pullAndMergeRestore, mergeById, hasRealLocalData, dedupeWalletsByName } =
  await import("./sync.store");
const { mergeRecentWindow } = await import("./sync-merge");

const SPREADSHEET_ID = "sheet-123";
const originalFetch = globalThis.fetch;
beforeEach(() => {
  localStorage.clear();
  writeCredentials({ secret: "s", spreadsheetId: SPREADSHEET_ID }); // unused by pullAndMergeRestore itself, kept for parity with other tests in this file
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const VALID_EXPENSE = {
  id: "1",
  source: "manual",
  title: "Coffee",
  amount: 20000,
  currency: "IDR",
  date: "2026-08-21",
  createdAt: "2026-08-21T00:00:00.000Z",
  walletId: "w1",
};
const VALID_WALLET = { id: "w1", name: "Main Wallet", animal: "cat" as const };

// pullAndMergeRestore pulls the same trailing-7-day window as
// pullRecentAndMerge (see sync.store.ts's recentCutoffKey) — a row dated
// today is always inside it, so these tests date rows "today" (well
// within the window) and "2020-01-01" (always outside it) rather than
// hardcoding a cutoff date that would go stale.
const TODAY = new Date().toISOString().slice(0, 10);

test("pullAndMergeRestore reconciles the recent window (sheet wins in-window) but leaves older local data untouched", async () => {
  const oldLocal = { ...VALID_EXPENSE, id: "old-local", date: "2020-01-01" };
  writeAllExpenses([oldLocal]);
  writeAllWallets([VALID_WALLET]);

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        valueRanges: [
          {
            values: [
              [
                "1",
                TODAY,
                "Main Wallet",
                "w1",
                "Coffee",
                20000,
                "IDR",
                "manual",
                "",
                "",
                1,
                TODAY.slice(0, 7),
                "2026-08-21T00:00:00.000Z",
                "",
              ],
            ],
          },
          { values: [["w1", "Main Wallet"]] },
        ],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  const result = await pullAndMergeRestore(SPREADSHEET_ID);

  // old-local (outside the window) survives untouched; the sheet's
  // in-window row is added/updated. category: null — an empty Category
  // cell normalizes to null. note: null — expenseFromRow always sets it
  // explicitly, even for a blank Note cell.
  const expectedExpenses = [
    oldLocal,
    { ...VALID_EXPENSE, date: TODAY, category: null, note: null },
  ];
  expect(result.expenses).toEqual(expectedExpenses);
  expect(result.wallets).toEqual([VALID_WALLET]);
  // Also written straight to localStorage — flushQueue relies on this,
  // not just the returned value, to keep localStorage/React state in sync.
  expect(readExpenses()).toEqual(expectedExpenses);
  expect(readWallets()).toEqual([VALID_WALLET]);
});

test("pullAndMergeRestore drops a local expense in-window that the sheet no longer has (remote delete)", async () => {
  const deletedRemotely = { ...VALID_EXPENSE, id: "deleted", date: TODAY };
  writeAllExpenses([deletedRemotely]);
  writeAllWallets([VALID_WALLET]);

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ valueRanges: [{ values: [] }, { values: [["w1", "Main Wallet"]] }] }),
      { status: 200 },
    )) as unknown as typeof fetch;

  const result = await pullAndMergeRestore(SPREADSHEET_ID);

  expect(result.expenses).toEqual([]);
});

test("pullAndMergeRestore rejects and leaves local data untouched when the sheet returns invalid rows", async () => {
  writeAllExpenses([]);
  globalThis.fetch = (async () =>
    new Response(
      // Blank title cell → mapped Expense has title:"", which fails
      // expenseSchema's min(1) — pullAndMergeRestore's own z.array(...).parse
      // catches this before anything gets written locally.
      JSON.stringify({
        valueRanges: [
          {
            values: [
              [
                "1",
                TODAY,
                "",
                "w1",
                "",
                0,
                "IDR",
                "manual",
                "",
                "",
                1,
                TODAY.slice(0, 7),
                "2026-08-21T00:00:00.000Z",
                "",
              ],
            ],
          },
          { values: [] },
        ],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  await expect(pullAndMergeRestore(SPREADSHEET_ID)).rejects.toThrow();
  expect(readExpenses()).toEqual([]);
});

// mergeById/hasRealLocalData are the core of connect()'s "two scenarios"
// logic (see sync.store.ts's useSheetsSync) — the part most worth a
// direct test, since connect() itself needs a live network + a React
// render harness this repo doesn't have (same reasoning as
// wallet.store.ts's addWalletPure/etc.).

test("mergeById unions by id, keeping the sheet's copy on a collision", () => {
  const sheet = [
    { id: "1", v: "sheet" },
    { id: "2", v: "sheet" },
  ];
  const local = [
    { id: "1", v: "local" },
    { id: "3", v: "local" },
  ];

  expect(mergeById(sheet, local)).toEqual([
    { id: "1", v: "sheet" }, // collision: sheet wins
    { id: "2", v: "sheet" },
    { id: "3", v: "local" }, // local-only survives
  ]);
});

test("mergeById returns the sheet list unchanged when local has nothing new", () => {
  const sheet = [{ id: "1", v: "sheet" }];
  expect(mergeById(sheet, [])).toEqual(sheet);
});

test("hasRealLocalData is false for an untouched fresh device (no expenses, only the default wallet)", () => {
  expect(hasRealLocalData([], [{ id: "w1", name: DEFAULT_WALLET_NAME, animal: "cat" }])).toBe(
    false,
  );
});

test("hasRealLocalData is true once there's at least one expense", () => {
  expect(
    hasRealLocalData(
      [{ id: "1" } as never],
      [{ id: "w1", name: DEFAULT_WALLET_NAME, animal: "cat" }],
    ),
  ).toBe(true);
});

test("hasRealLocalData is true for more than one wallet, or a renamed single wallet", () => {
  expect(
    hasRealLocalData(
      [],
      [
        { id: "w1", name: DEFAULT_WALLET_NAME, animal: "cat" },
        { id: "w2", name: "Bank", animal: "dog" },
      ],
    ),
  ).toBe(true);
  expect(hasRealLocalData([], [{ id: "w1", name: "Renamed", animal: "cat" }])).toBe(true);
});

// dedupeWalletsByName — the fix for two independently-seeded default
// wallets (each device's own random id) surviving mergeById as a visible
// duplicate once both are named "Main Wallet".
test("dedupeWalletsByName collapses a same-name/different-id pair, keeping the first and remapping its expenses", () => {
  const wallets = [
    { id: "sheet-1", name: "Main Wallet", animal: "cat" as const },
    { id: "local-1", name: "Main Wallet", animal: "dog" as const },
    { id: "local-2", name: "Bank", animal: "fish" as const },
  ];
  const expenses = [{ ...VALID_EXPENSE, id: "e1", walletId: "local-1" }];

  const result = dedupeWalletsByName(wallets, expenses);

  expect(result.wallets).toEqual([
    { id: "sheet-1", name: "Main Wallet", animal: "cat" },
    { id: "local-2", name: "Bank", animal: "fish" },
  ]);
  expect(result.expenses).toEqual([{ ...VALID_EXPENSE, id: "e1", walletId: "sheet-1" }]);
});

test("dedupeWalletsByName is case/whitespace-insensitive on the name match", () => {
  const wallets = [
    { id: "a", name: "Main Wallet", animal: "cat" as const },
    { id: "b", name: " main wallet ", animal: "dog" as const },
  ];
  expect(dedupeWalletsByName(wallets, []).wallets).toEqual([
    { id: "a", name: "Main Wallet", animal: "cat" },
  ]);
});

test("dedupeWalletsByName no-ops when names are already unique", () => {
  const wallets = [
    { id: "a", name: "Main Wallet", animal: "cat" as const },
    { id: "b", name: "Bank", animal: "dog" as const },
  ];
  const expenses = [{ ...VALID_EXPENSE, id: "e1", walletId: "a" }];
  expect(dedupeWalletsByName(wallets, expenses)).toEqual({ wallets, expenses });
});

// mergeRecentWindow — the sheet-wins reconcile behind pullRecentAndMerge
// (sync.store.ts): everything before `cutoff` is local's own business,
// everything from `cutoff` onward belongs entirely to whatever the sheet
// says now (added, edited, or vanished because another device deleted it).
test("mergeRecentWindow keeps old local expenses untouched and replaces the window with the sheet's copy", () => {
  const old = { ...VALID_EXPENSE, id: "old", date: "2026-08-01" };
  const localInWindow = { ...VALID_EXPENSE, id: "local-in-window", date: "2026-08-25" };
  const sheetInWindow = { ...VALID_EXPENSE, id: "sheet-in-window", date: "2026-08-26" };

  const result = mergeRecentWindow([old, localInWindow], [sheetInWindow], "2026-08-24");

  expect(result).toEqual([old, sheetInWindow]); // localInWindow is gone — sheet's window is authoritative
});

test("mergeRecentWindow drops a local expense in-window that the sheet no longer has (remote delete)", () => {
  const deletedRemotely = { ...VALID_EXPENSE, id: "deleted", date: "2026-08-25" };
  expect(mergeRecentWindow([deletedRemotely], [], "2026-08-24")).toEqual([]);
});

test("mergeRecentWindow adds a sheet expense the device never had (another device's push)", () => {
  const fromOtherDevice = { ...VALID_EXPENSE, id: "other-device", date: "2026-08-27" };
  expect(mergeRecentWindow([], [fromOtherDevice], "2026-08-24")).toEqual([fromOtherDevice]);
});
