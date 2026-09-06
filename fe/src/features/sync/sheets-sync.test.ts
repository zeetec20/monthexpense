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
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
globalThis.localStorage = new MemoryStorage() as unknown as Storage;

// No `window`/GIS in bun test — every Sheets API call goes through
// getFreshAccessToken (google-auth.ts), which needs a real browser. Stub
// it so this file can test the actual Sheets API request/response shapes
// without pulling in GIS at all — same reasoning the old exec-URL tests
// never needed a token (a plain secret string, no OAuth involved).
mock.module("./google-auth", () => ({ getFreshAccessToken: async () => "test-access-token" }));

const {
  readCredentials,
  writeCredentials,
  clearCredentials,
  getConnectedEmail,
  sheetIdentityHeaders,
  validateSheetSecret,
  pullAll,
  pullRecent,
  applySyncOp,
  pushAll,
} = await import("./sheets-sync.api");

const SPREADSHEET_ID = "sheet-123";
const originalFetch = globalThis.fetch;
beforeEach(() => localStorage.clear());
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const EXPENSE = {
  id: "1",
  source: "manual" as const,
  title: "Coffee",
  amount: 20000,
  currency: "IDR",
  date: "2026-08-21",
  createdAt: "2026-08-21T00:00:00.000Z",
  walletId: "w1",
};
const WALLET = { id: "w1", name: "Main Wallet", animal: "cat" as const };

test("readCredentials/writeCredentials/clearCredentials round-trip", () => {
  expect(readCredentials()).toBeNull();
  writeCredentials({ secret: "s3cret", spreadsheetId: SPREADSHEET_ID });
  expect(readCredentials()).toEqual({ secret: "s3cret", spreadsheetId: SPREADSHEET_ID, email: undefined });
  clearCredentials();
  expect(readCredentials()).toBeNull();
});

test("writeCredentials/readCredentials/getConnectedEmail round-trip the connected account's email", () => {
  writeCredentials({ secret: "s3cret", spreadsheetId: SPREADSHEET_ID, email: "me@example.com" });
  expect(readCredentials()).toEqual({ secret: "s3cret", spreadsheetId: SPREADSHEET_ID, email: "me@example.com" });
  expect(getConnectedEmail()).toBe("me@example.com");
});

test("getConnectedEmail is null while disconnected", () => {
  expect(getConnectedEmail()).toBeNull();
});

test("sheetIdentityHeaders is empty with no stored credentials", () => {
  expect(sheetIdentityHeaders()).toEqual({});
});

test("sheetIdentityHeaders sends secret/spreadsheetId once connected", () => {
  writeCredentials({ secret: "s3cret", spreadsheetId: SPREADSHEET_ID });
  expect(sheetIdentityHeaders()).toEqual({ "X-Sheet-Secret": "s3cret", "X-Spreadsheet-Id": SPREADSHEET_ID });
});

test("validateSheetSecret posts to BE's /v1/sheets/validate with the sheet identity headers, resolves on 2xx", async () => {
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedHeaders = new Headers((init as RequestInit).headers);
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  }) as typeof fetch;

  await validateSheetSecret("s3cret", SPREADSHEET_ID);

  expect(capturedUrl).toContain("/v1/sheets/validate");
  expect(capturedHeaders?.get("X-Sheet-Secret")).toBe("s3cret");
  expect(capturedHeaders?.get("X-Spreadsheet-Id")).toBe(SPREADSHEET_ID);
});

test("validateSheetSecret rejects on a non-2xx (secret wasn't minted by this app, or is banned/mismatched)", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 })) as unknown as typeof fetch;
  await expect(validateSheetSecret("bad", SPREADSHEET_ID)).rejects.toThrow();
});

test("pullAll maps Transactions/Wallets rows, converting the Date serial back to a date key and the category label back to its slug", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        valueRanges: [
          { values: [["1", 46255, "Main Wallet", "w1", "Coffee", 20000, "IDR", "manual", "", "", 1, "2026-08", "2026-08-21T00:00:00.000Z", "Food & Snack"]] },
          { values: [["w1", "Main Wallet"]] },
        ],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  const result = await pullAll(SPREADSHEET_ID);

  expect(result.expenses).toEqual([
    { id: "1", date: "2026-08-21", walletId: "w1", title: "Coffee", amount: 20000, currency: "IDR", source: "manual", note: null, createdAt: "2026-08-21T00:00:00.000Z", category: "food_snack" },
  ]);
  expect(result.wallets).toEqual([{ id: "w1", name: "Main Wallet", animal: "cat" }]);
});

test("pullRecent filters the mapped expenses to the trailing window client-side", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        valueRanges: [
          {
            values: [
              ["old", 45000, "", "w1", "Old", 1000, "IDR", "manual", "", "", 1, "2023-03", "2023-03-01T00:00:00.000Z", ""],
              ["recent", 46255, "", "w1", "Recent", 1000, "IDR", "manual", "", "", 1, "2026-08", "2026-08-21T00:00:00.000Z", ""],
            ],
          },
          { values: [] },
        ],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  const result = await pullRecent(SPREADSHEET_ID, "2026-08-01");

  expect(result.expenses.map((e) => e.id)).toEqual(["recent"]);
});

test("applySyncOp upsertExpense appends when the id isn't found, using RAW input", async () => {
  const calledUrls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calledUrls.push(String(url));
    if (String(url).includes("/values/Transactions!A2:A")) return new Response(JSON.stringify({ values: [] }), { status: 200 });
    if (String(url).includes("/values/Config!A2:B")) return new Response(JSON.stringify({ values: [["w1", "Main Wallet"]] }), { status: 200 });
    if (String(url).includes(":append")) return new Response(JSON.stringify({}), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 }); // :batchUpdate for the date-format pass
  }) as unknown as typeof fetch;

  await applySyncOp(SPREADSHEET_ID, { type: "upsertExpense", expense: EXPENSE });

  expect(calledUrls.some((u) => u.includes(":append") && u.includes("valueInputOption=RAW"))).toBe(true);
});

test("applySyncOp upsertExpense updates the existing row in place when the id is found", async () => {
  const calledUrls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calledUrls.push(String(url));
    if (String(url).includes("/values/Transactions!A2:A")) return new Response(JSON.stringify({ values: [["1"]] }), { status: 200 });
    if (String(url).includes("/values/Config!A2:B")) return new Response(JSON.stringify({ values: [["w1", "Main Wallet"]] }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  await applySyncOp(SPREADSHEET_ID, { type: "upsertExpense", expense: EXPENSE });

  expect(calledUrls.some((u) => u.includes("/values/Transactions!A2:O2") && u.includes("valueInputOption=RAW"))).toBe(true);
});

test("applySyncOp deleteExpense deletes the row via batchUpdate when found, no-ops when not found", async () => {
  let batchUpdateCalled = false;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (String(url).includes("/values/Transactions!A2:A")) return new Response(JSON.stringify({ values: [["1"]] }), { status: 200 });
    if (String(url).endsWith(`${SPREADSHEET_ID}:batchUpdate`)) {
      batchUpdateCalled = true;
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  await applySyncOp(SPREADSHEET_ID, { type: "deleteExpense", id: "1" });
  expect(batchUpdateCalled).toBe(true);

  batchUpdateCalled = false;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (String(url).includes("/values/Transactions!A2:A")) return new Response(JSON.stringify({ values: [] }), { status: 200 });
    if (String(url).endsWith(`${SPREADSHEET_ID}:batchUpdate`)) batchUpdateCalled = true;
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;
  await applySyncOp(SPREADSHEET_ID, { type: "deleteExpense", id: "missing" });
  expect(batchUpdateCalled).toBe(false);
});

test("pushAll clears both ranges then writes the full arrays with RAW input", async () => {
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body as string) : undefined });
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  await pushAll(SPREADSHEET_ID, [EXPENSE], [WALLET]);

  expect(calls[0]!.url).toContain(":batchClear");
  expect(calls.some((c) => c.url.includes(":batchUpdate") && !c.url.includes("sheets.googleapis.com/v4/spreadsheets/sheet-123:batchUpdate") && (c.body as any)?.valueInputOption === "RAW")).toBe(true);
});

test("upsertExpense then pullAll round-trips receiptDetail (items included) and scheduleType through the Detail column", async () => {
  const expenseWithDetail = {
    ...EXPENSE,
    scheduleType: "scheduled" as const,
    paid: true,
    receiptDetail: {
      time: null,
      receiptNumber: null,
      merchantName: "Warung Kopi",
      merchantAddress: null,
      merchantPhone: null,
      items: [{ name: "Kopi Susu", quantity: 1.5, unitPrice: 12000, total: 18000 }],
      subtotal: 18000,
      tax: 0,
      discount: 0,
      serviceCharge: 0,
      total: 18000,
      paymentMethod: null,
      cashReceived: null,
      change: null,
    },
  };
  let pushedRow: unknown[] | undefined;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/values/Transactions!A2:A")) return new Response(JSON.stringify({ values: [] }), { status: 200 });
    if (u.includes("/values/Config!A2:B")) return new Response(JSON.stringify({ values: [["w1", "Main Wallet"]] }), { status: 200 });
    if (u.includes(":append")) {
      pushedRow = (JSON.parse(init!.body as string).values as unknown[][])[0];
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  await applySyncOp(SPREADSHEET_ID, { type: "upsertExpense", expense: expenseWithDetail });
  expect(pushedRow).toBeDefined();

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ valueRanges: [{ values: [pushedRow] }, { values: [] }] }), { status: 200 })) as unknown as typeof fetch;

  const { expenses } = await pullAll(SPREADSHEET_ID);
  expect(expenses[0]!.receiptDetail).toEqual(expenseWithDetail.receiptDetail);
  expect(expenses[0]!.scheduleType).toBe("scheduled");
  expect(expenses[0]!.paid).toBe(true);
});

test("a 403/404 from Sheets API is reported as SHEET_DELETED", async () => {
  globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
  try {
    await pullAll(SPREADSHEET_ID);
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { code?: string }).code).toBe("SHEET_DELETED");
  }
});
