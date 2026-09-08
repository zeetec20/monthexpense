import { RECEIPT_API_URL, RECEIPT_API_KEY } from "@/config/env";
import { getFreshAccessToken } from "./google-auth";
import {
  TXN_HEADERS,
  WALLET_HEADERS,
  TRANSACTIONS_SHEET_ID,
  CONFIG_SHEET_ID,
} from "./google-provision.client";
import { normalizeExpenseCategory, type Expense } from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";

// Talks to Google Sheets API directly with the connected account's own
// (silently-refreshed) OAuth access token — no Apps Script deployment in
// the middle anymore (see the plan: every past sync bug — wrong "deleted"
// message, "file not found" for a second account, deployment access
// settings, the one-time "Review permissions" screen — traced back to that
// bridge). BE never sees any of this, same as before: it only ever gets
// `secret`/`spreadsheetId` for its own unrelated quota/identity system
// (see sheetIdentityHeaders below), never Google-signed tokens or expense
// data.
const CREDENTIALS_KEY = "expense-notes.sync-credentials.v1";

export interface SheetCredentials {
  /** BE-minted secret (see google-auth.ts's exchangeEmailForSecret) — only
   * ever used for the *unrelated* BE quota/identity system's
   * X-Sheet-Secret header (see sheetIdentityHeaders), never for talking to
   * Google, which is authenticated by the OAuth access token instead. */
  secret: string;
  spreadsheetId: string;
  /** Connected Google account's own email (see google-auth.ts's
   * fetchGoogleEmail) — display-only (SyncMenu), never sent anywhere.
   * .optional() so credentials written before this field existed still
   * parse — getConnectedEmail() below just returns null for those until
   * the next connect/reconnect. */
  email?: string;
}

export const readCredentials = (): SheetCredentials | null => {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SheetCredentials>;
    if (typeof parsed.secret !== "string" || typeof parsed.spreadsheetId !== "string") return null;
    return {
      secret: parsed.secret,
      spreadsheetId: parsed.spreadsheetId,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
    };
  } catch {
    return null;
  }
};

export const writeCredentials = (credentials: SheetCredentials): void => {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
};

export const clearCredentials = (): void => {
  localStorage.removeItem(CREDENTIALS_KEY);
};

/** For SyncMenu's connected-account display — null while disconnected, or
 * for credentials stored before the email field existed. */
export const getConnectedEmail = (): string | null => {
  return readCredentials()?.email ?? null;
};

/** Headers identifying this connected sheet to BE's scan/voice endpoints
 * (see receipt.api.ts / voice.api.ts / cloudflare-stt.ts). */
export const sheetIdentityHeaders = (): Record<string, string> => {
  const credentials = readCredentials();
  if (!credentials) return {};
  return { "X-Sheet-Secret": credentials.secret, "X-Spreadsheet-Id": credentials.spreadsheetId };
};

/** Confirms with BE that this secret was actually minted by this system
 * (not made up by a user) — POST /v1/sheets/validate, same X-Sheet-Secret/
 * X-Spreadsheet-Id headers the scan/voice endpoints use, but meters no
 * quota (see sync.store.ts's connect()). */
export const validateSheetSecret = async (secret: string, spreadsheetId: string): Promise<void> => {
  const response = await fetch(`${RECEIPT_API_URL}/v1/sheets/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RECEIPT_API_KEY}`,
      "X-Sheet-Secret": secret,
      "X-Spreadsheet-Id": spreadsheetId,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ||
        "This sync secret wasn't issued by this app. Reconnect with a valid one.",
    );
  }
};

// --- Direct Sheets API plumbing ------------------------------------------

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Sheets' own date epoch (Dec 30 1899 — carries Lotus 1-2-3's leap-year
 * bug forward, a well-known Sheets/Excel quirk) — writing/reading the Date
 * column as this serial number (not a string) is what keeps Tren
 * Pengeluaran's DAY()/EOMONTH() formulas working (see
 * google-provision.client.ts's buildSpreadsheetStructure_), while every
 * other column is a plain RAW-written string/number with zero risk of
 * Sheets auto-detecting and silently coercing it (see dateToSerial's and
 * valueInputOption's comments below) — the actual cause of every past
 * "NaN-NaN"/date/category coercion bug this sync layer used to have. */
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

const dateToSerial = (dateKey: string): number => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - SHEETS_EPOCH_UTC) / MS_PER_DAY);
};

const serialToDateKey = (serial: number): string => {
  return new Date(SHEETS_EPOCH_UTC + serial * MS_PER_DAY).toISOString().slice(0, 10);
};

const CATEGORY_LABELS: Record<string, string> = {
  food_snack: "Food & Snack",
  grocery: "Grocery",
  transportation: "Transportation",
  bills: "Bills",
  subscription: "Subscription",
  investment: "Investment",
  entertainment: "Entertainment",
  other: "Other",
};

/** Thrown for a 403/404 — the spreadsheet is gone or this account lost
 * access to it. Same `.code` pattern the rest of this app already uses
 * (see sync.store.ts's handleAuthError) — not a dedicated subclass since
 * this crosses postMessage in no code path here, just kept for consistency. */
const sheetGoneError = (status: number): Error & { code: string } => {
  const err = new Error(
    `The connected spreadsheet appears to have been deleted (${status}).`,
  ) as Error & { code: string };
  err.code = "SHEET_DELETED";
  return err;
};

/** Every Sheets API call routes through here. One silent retry on a 401
 * (the cached token expired between getFreshAccessToken's check and the
 * request actually landing — rare but possible) forces a fresh token and
 * tries once more; a second straight 401 propagates. 403/404 → SHEET_DELETED
 * (gone or access revoked). Network-level failures (offline, DNS) just
 * reject normally — sync.store.ts's queue/retry already treats any
 * rejection the same way regardless of cause. */
const sheetsFetch = async (url: string, init: RequestInit = {}, isRetry = false): Promise<any> => {
  const token = await getFreshAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (response.status === 401 && !isRetry) {
    return sheetsFetch(url, init, true);
  }
  if (response.status === 403 || response.status === 404) throw sheetGoneError(response.status);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Sheets sync failed (${response.status}): ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

const walletRow = (wallet: Wallet): (string | number)[] => {
  return [wallet.id, wallet.name];
};

const walletFromRow = (row: unknown[]): Wallet => {
  return { id: String(row[0] ?? ""), name: String(row[1] ?? ""), animal: "cat" };
};

const txnRow = (expense: Expense, walletNameById: Map<string, string>): (string | number)[] => {
  const detail = expense.receiptDetail;
  return [
    expense.id,
    expense.date ? dateToSerial(expense.date) : "",
    walletNameById.get(expense.walletId ?? "") ?? "",
    expense.walletId ?? "",
    expense.title,
    expense.amount,
    expense.currency,
    expense.source,
    expense.note ?? "",
    detail?.merchantName ?? "",
    detail && detail.items.length > 0 ? detail.items.length : 1,
    (expense.date ?? "").slice(0, 7),
    expense.createdAt,
    CATEGORY_LABELS[expense.category ?? ""] ?? CATEGORY_LABELS.other,
    // Cols A-N above are the fixed, formula-friendly columns; everything
    // else (items array, subtotal/tax/etc, schedule flags) is too
    // variable-shaped for its own column, so it rides along as one JSON
    // blob instead — see expenseFromRow's matching parse.
    JSON.stringify({
      receiptDetail: detail ?? null,
      scheduleType: expense.scheduleType ?? null,
      paid: expense.paid ?? false,
      settled: expense.settled ?? false,
    }),
  ];
};

/** Parses txnRow's "Detail" JSON blob (col O) back into the Expense fields
 * it carries. Missing/blank/unparseable cell (rows written before this
 * column existed, or a stray manual edit) degrades to "nothing extra
 * known" rather than throwing. */
const parseDetailCell = (
  cell: unknown,
): Pick<Expense, "receiptDetail" | "scheduleType" | "paid" | "settled"> => {
  if (typeof cell !== "string" || cell === "") return {} as ReturnType<typeof parseDetailCell>;
  try {
    const parsed = JSON.parse(cell) as Partial<ReturnType<typeof parseDetailCell>>;
    return {
      receiptDetail: parsed.receiptDetail ?? null,
      scheduleType: parsed.scheduleType ?? null,
      paid: parsed.paid ?? false,
      settled: parsed.settled ?? false,
    };
  } catch {
    return {} as ReturnType<typeof parseDetailCell>;
  }
};

/** Category comes back as the display label ("Food & Snack"), not the
 * slug ("food_snack") — written that way on purpose so Sheets formulas can
 * group on it directly (see txnRow above). normalizeExpenseCategory maps
 * it back for FE-side strict-slug matching (AnalyticsPage/HomeDashboard). */
const expenseFromRow = (row: unknown[]): Expense => {
  const dateCell = row[1];
  const date = typeof dateCell === "number" ? serialToDateKey(dateCell) : String(dateCell ?? "");
  return {
    id: String(row[0] ?? ""),
    date,
    walletId: String(row[3] ?? ""),
    title: String(row[4] ?? ""),
    amount: Number(row[5] ?? 0),
    currency: String(row[6] ?? "IDR"),
    source: (row[7] as Expense["source"]) ?? "manual",
    note: row[8] ? String(row[8]) : null,
    createdAt: row[12] ? String(row[12]) : new Date().toISOString(),
    category: normalizeExpenseCategory(row[13] ? String(row[13]) : null),
    ...parseDetailCell(row[14]),
  };
};

/** Reads the ID column only (cheap) to find `id`'s 1-indexed sheet row, or
 * -1 if not present — every upsert/delete needs this first. */
const findRow = async (spreadsheetId: string, sheetName: string, id: string): Promise<number> => {
  const json = await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${sheetName}!A2:A?valueRenderOption=UNFORMATTED_VALUE`,
  );
  const ids: unknown[][] = json.values ?? [];
  const index = ids.findIndex((row) => String(row[0] ?? "") === id);
  return index === -1 ? -1 : index + 2;
};

const buildWalletNameMap = async (spreadsheetId: string): Promise<Map<string, string>> => {
  const json = await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/Config!A2:B?valueRenderOption=UNFORMATTED_VALUE`,
  );
  const rows: unknown[][] = json.values ?? [];
  return new Map(rows.map((row) => [String(row[0] ?? ""), String(row[1] ?? "")]));
};

/** Sets the Date and Amount columns' display format on one row — cosmetic
 * only (DAY()/EOMONTH() work on the Date's underlying serial number, sums
 * work on Amount's raw value, regardless of display format), but keeps
 * the sheet looking right: a real date column with a calendar picker, and
 * thousands-separated money, on manual edit too. */
const formatRowCells = async (spreadsheetId: string, row: number): Promise<void> => {
  await sheetsFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: TRANSACTIONS_SHEET_ID,
              startRowIndex: row - 1,
              endRowIndex: row,
              startColumnIndex: 1,
              endColumnIndex: 2,
            },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: TRANSACTIONS_SHEET_ID,
              startRowIndex: row - 1,
              endRowIndex: row,
              startColumnIndex: 5,
              endColumnIndex: 6,
            },
            cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    }),
  });
};

const upsertExpense = async (spreadsheetId: string, expense: Expense): Promise<void> => {
  const [row, walletNameById] = await Promise.all([
    findRow(spreadsheetId, "Transactions", expense.id),
    buildWalletNameMap(spreadsheetId),
  ]);
  const values = [txnRow(expense, walletNameById)];
  if (row === -1) {
    await sheetsFetch(
      // OVERWRITE, not INSERT_ROWS: INSERT_ROWS makes Sheets insert a
      // brand-new grid row for every expense, which doesn't inherit the
      // setDataValidation dropdown rule applied at provisioning time (that
      // rule is bound to the rows that existed when it was set — untouched
      // rows below it shift down and keep it, a freshly *inserted* row
      // doesn't). OVERWRITE fills the next already-existing blank
      // (pre-validated) row instead, so the Category/Wallet dropdowns
      // carry over to every real row, not just the still-untouched ones.
      `${SHEETS_API}/${spreadsheetId}/values/Transactions!A:O:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
      { method: "POST", body: JSON.stringify({ values }) },
    );
    // Appended row's exact index isn't known without re-reading — one more
    // cheap ID-column read to format just that row's Date cell.
    const appendedRow = await findRow(spreadsheetId, "Transactions", expense.id);
    if (appendedRow !== -1) await formatRowCells(spreadsheetId, appendedRow);
  } else {
    await sheetsFetch(
      `${SHEETS_API}/${spreadsheetId}/values/Transactions!A${row}:O${row}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values }),
      },
    );
    await formatRowCells(spreadsheetId, row);
  }
};

const deleteExpense = async (spreadsheetId: string, id: string): Promise<void> => {
  const row = await findRow(spreadsheetId, "Transactions", id);
  if (row === -1) return; // already gone — nothing to do
  await sheetsFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: TRANSACTIONS_SHEET_ID,
              dimension: "ROWS",
              startIndex: row - 1,
              endIndex: row,
            },
          },
        },
      ],
    }),
  });
};

const upsertWallet = async (spreadsheetId: string, wallet: Wallet): Promise<void> => {
  const row = await findRow(spreadsheetId, "Config", wallet.id);
  const values = [walletRow(wallet)];
  if (row === -1) {
    // Same OVERWRITE-not-INSERT_ROWS reasoning as upsertExpense above.
    await sheetsFetch(
      `${SHEETS_API}/${spreadsheetId}/values/Config!A:B:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
      {
        method: "POST",
        body: JSON.stringify({ values }),
      },
    );
  } else {
    await sheetsFetch(
      `${SHEETS_API}/${spreadsheetId}/values/Config!A${row}:B${row}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values }),
      },
    );
  }
};

const deleteWallet = async (spreadsheetId: string, id: string): Promise<void> => {
  const row = await findRow(spreadsheetId, "Config", id);
  if (row === -1) return;
  await sheetsFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: CONFIG_SHEET_ID,
              dimension: "ROWS",
              startIndex: row - 1,
              endIndex: row,
            },
          },
        },
      ],
    }),
  });
};

/** One create/edit/delete of a single expense or wallet — sync.store.ts's
 * queue flush applies these one at a time (see applySyncOp), removing each
 * from the persisted queue only once it actually lands, so a mid-batch
 * failure (e.g. a 429) leaves exactly what's left still queued for the
 * next retry instead of redoing already-applied ops or losing the rest. */
export type SyncOp =
  | { type: "upsertExpense"; expense: Expense }
  | { type: "deleteExpense"; id: string }
  | { type: "upsertWallet"; wallet: Wallet }
  | { type: "deleteWallet"; id: string };

export const applySyncOp = async (spreadsheetId: string, op: SyncOp): Promise<void> => {
  if (op.type === "upsertExpense") return upsertExpense(spreadsheetId, op.expense);
  if (op.type === "deleteExpense") return deleteExpense(spreadsheetId, op.id);
  if (op.type === "upsertWallet") return upsertWallet(spreadsheetId, op.wallet);
  return deleteWallet(spreadsheetId, op.id);
};

interface PulledData {
  expenses: Expense[];
  wallets: Wallet[];
}

const batchGetAll = async (spreadsheetId: string): Promise<PulledData> => {
  const json = await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values:batchGet?valueRenderOption=UNFORMATTED_VALUE` +
      `&ranges=${encodeURIComponent("Transactions!A2:O")}&ranges=${encodeURIComponent("Config!A2:B")}`,
  );
  const [txnRange, walletRange] = json.valueRanges ?? [];
  const expenses: Expense[] = (txnRange?.values ?? []).map((row: unknown[]) => expenseFromRow(row));
  const wallets: Wallet[] = (walletRange?.values ?? []).map((row: unknown[]) => walletFromRow(row));
  return { expenses, wallets };
};

/** Full read — used at connect() time and by the explicit "restore from
 * sheet" action, where a complete picture is correct. */
export const pullAll = async (spreadsheetId: string): Promise<PulledData> => {
  return batchGetAll(spreadsheetId);
};

/** Same read as pullAll — Sheets API has no server-side row filtering the
 * way the old Apps Script bridge's handlePullRecent_ did, so this is the
 * same one `values:batchGet` call (still cheap: one HTTP round trip,
 * personal-expense-app scale), just filtered to the trailing `cutoffKey`
 * (a "YYYY-MM-DD" key, string-comparable) client-side before returning —
 * the *behavior* callers rely on (only this week's data can affect the
 * local merge — see sync.store.ts's pullRecentAndMerge) stays identical,
 * only the request itself is no longer narrower. */
export const pullRecent = async (spreadsheetId: string, cutoffKey: string): Promise<PulledData> => {
  const { expenses, wallets } = await batchGetAll(spreadsheetId);
  return { expenses: expenses.filter((e) => e.date >= cutoffKey), wallets };
};

/** One-shot full overwrite — used only by connect()'s post-merge
 * convergence (needs a complete, definitive write) and nowhere in the
 * everyday create/edit/delete path, which goes through applySyncOp's
 * single-row operations instead. Clears each range first (a shorter new
 * list must not leave stale trailing rows behind), then writes fresh rows
 * with the same RAW input + explicit date-format pass as upsertExpense. */
export const pushAll = async (
  spreadsheetId: string,
  expenses: Expense[],
  wallets: Wallet[],
): Promise<void> => {
  await sheetsFetch(`${SHEETS_API}/${spreadsheetId}/values:batchClear`, {
    method: "POST",
    body: JSON.stringify({ ranges: ["Transactions!A2:O", "Config!A2:B"] }),
  });
  const walletNameById = new Map(wallets.map((w) => [w.id, w.name]));
  const data: { range: string; values: (string | number)[][] }[] = [];
  if (wallets.length > 0) data.push({ range: "Config!A2", values: wallets.map(walletRow) });
  if (expenses.length > 0)
    data.push({ range: "Transactions!A2", values: expenses.map((e) => txnRow(e, walletNameById)) });
  if (data.length > 0) {
    await sheetsFetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }
  if (expenses.length > 0) {
    await sheetsFetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: TRANSACTIONS_SHEET_ID,
                startRowIndex: 1,
                endRowIndex: 1 + expenses.length,
                startColumnIndex: 1,
                endColumnIndex: 2,
              },
              cell: {
                userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } },
              },
              fields: "userEnteredFormat.numberFormat",
            },
          },
          {
            repeatCell: {
              range: {
                sheetId: TRANSACTIONS_SHEET_ID,
                startRowIndex: 1,
                endRowIndex: 1 + expenses.length,
                startColumnIndex: 5,
                endColumnIndex: 6,
              },
              cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } },
              fields: "userEnteredFormat.numberFormat",
            },
          },
        ],
      }),
    });
  }
};

// TXN_HEADERS/WALLET_HEADERS re-exported so tests/callers that only need
// the header shape don't have to import google-provision.client.ts too.
export { TXN_HEADERS, WALLET_HEADERS };
