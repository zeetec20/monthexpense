// Ported from text-processing-slm's old server-side google-provision.ts —
// same Drive/Sheets REST calls, same URLs/payloads, now running in the
// browser with an access_token obtained directly via Google Identity
// Services (see google-auth.ts) instead of server-side. Moving this here
// is what makes real per-step progress possible: BE used to do all of
// this as one opaque black box. No more Apps Script project/deployment —
// sheets-sync.api.ts talks to Sheets API directly with the same
// access_token, so provisioning only ever needs to find-or-create the
// spreadsheet itself.
export type ProvisionStep = "searching" | "creating-sheet" | "building-structure";

export interface ProvisionResult {
  spreadsheetUrl: string;
  spreadsheetId: string;
}

const SHEET_NAME = "Month Expense";

export const CONFIG_SHEET_ID = 1;
export const TRANSACTIONS_SHEET_ID = 2;
const STATS_SHEET_ID = 3;
const WALLET_MAX = 15;
export const TXN_HEADERS = [
  "ID", "Date", "Wallet", "Wallet ID", "Title", "Amount", "Currency",
  "Source", "Note", "Merchant", "Items", "Month", "Created At", "Category",
  // JSON blob: full receiptDetail (items/subtotal/tax/etc — too variable-
  // shaped for its own fixed columns) + scheduleType/paid/settled, none of
  // which any column above carries. See sheets-sync.api.ts's txnRow/
  // expenseFromRow.
  "Detail",
];
export const WALLET_HEADERS = ["ID", "Name"];
// Category dropdown's fixed choice list — must match sheets-sync.api.ts's
// CATEGORY_LABELS values exactly (what's actually written on every
// upsert). Duplicated here rather than imported: sheets-sync.api.ts
// already imports TXN_HEADERS/etc from this file, so importing back would
// be circular.
const CATEGORY_LABELS_LIST = ["Food & Snack", "Grocery", "Transportation", "Bills", "Subscription", "Investment", "Entertainment", "Other"];

const WHITE = { red: 1, green: 1, blue: 1 };
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}
const SAGE_DARK = hexToRgb("#7A9E8E");
const SAGE_LIGHT = hexToRgb("#DCEAE3");
const AMBER_DARK = hexToRgb("#E3A94D");
const CORAL_DARK = hexToRgb("#E8837A");
const TEXT_DARK = hexToRgb("#233029");

type ValueEntry = { range: string; values: (string | number)[][] };

async function googleFetch(accessToken: string, url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google API call failed (${response.status}) ${init.method ?? "GET"} ${url}: ${body}`);
  }
  return response.json();
}

function colorRange(
  sheetId: number,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  bg: { red: number; green: number; blue: number },
  fg: { red: number; green: number; blue: number },
  opts: { bold?: boolean; center?: boolean } = { bold: true },
) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      cell: {
        userEnteredFormat: {
          backgroundColor: bg,
          horizontalAlignment: opts.center ? "CENTER" : undefined,
          textFormat: { foregroundColor: fg, bold: opts.bold ?? true },
        },
      },
      fields: opts.center
        ? "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)"
        : "userEnteredFormat(backgroundColor,textFormat)",
    },
  };
}

const THOUSANDS_FORMAT = { type: "NUMBER" as const, pattern: "#,##0" };

/** endRow omitted (undefined) means "to the bottom of the sheet" — used
 * for QUERY spill ranges whose row count isn't fixed (e.g. Spend by
 * Month, which grows every month the sheet is used) so the format never
 * needs re-applying as they grow. */
function numberFormatRange(sheetId: number, startRow: number, endRow: number | undefined, startCol: number, endCol: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, ...(endRow !== undefined ? { endRowIndex: endRow } : {}), startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { numberFormat: THOUSANDS_FORMAT } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

function mergeRange(sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number) {
  return {
    mergeCells: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      mergeType: "MERGE_ALL",
    },
  };
}

function basicChart(
  sheetId: number,
  chartType: "BAR" | "COLUMN" | "LINE",
  startRow: number,
  endRow: number,
  startCol: number,
  anchorRow: number,
  anchorCol: number,
  title: string,
) {
  const domain = { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: startCol + 1 };
  const series = { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol + 1, endColumnIndex: startCol + 2 };
  return {
    addChart: {
      chart: {
        spec: {
          title,
          basicChart: {
            chartType,
            headerCount: 1,
            domains: [{ domain: { sourceRange: { sources: [domain] } } }],
            series: [{ series: { sourceRange: { sources: [series] } } }],
          },
        },
        position: {
          overlayPosition: { anchorCell: { sheetId, rowIndex: anchorRow, columnIndex: anchorCol }, widthPixels: 480, heightPixels: 280 },
        },
      },
    },
  };
}

function pieChart(sheetId: number, startRow: number, endRow: number, startCol: number, anchorRow: number, anchorCol: number, title: string) {
  const domain = { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: startCol + 1 };
  const series = { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol + 1, endColumnIndex: startCol + 2 };
  return {
    addChart: {
      chart: {
        spec: {
          title,
          pieChart: { domain: { sourceRange: { sources: [domain] } }, series: { sourceRange: { sources: [series] } }, pieHole: 0.4 },
        },
        position: {
          overlayPosition: { anchorCell: { sheetId, rowIndex: anchorRow, columnIndex: anchorCol }, widthPixels: 480, heightPixels: 280 },
        },
      },
    },
  };
}

async function buildSpreadsheetStructure_(accessToken: string, spreadsheetId: string): Promise<void> {
  const values: ValueEntry[] = [
    { range: "Config!A1:B1", values: [["ID", "Name"]] },
    // Same tab, columns D:E — wallets and app config now share one
    // "Config" sheet (see readConfigSecret/writeConfigSecret below) rather
    // than each config concern getting its own tab. Header only here;
    // rows D2/D3 get filled by writeConfigSecret once a secret/email exist.
    { range: "Config!D1:E1", values: [["Key", "Value"]] },
    { range: `Transactions!A1:${String.fromCharCode(64 + TXN_HEADERS.length)}1`, values: [TXN_HEADERS] },
    { range: "Stats!A1", values: [["Month:"]] },
    // Every stat/QUERY below keys off $B$1 ("YYYY-MM") — without this,
    // B1 stays blank forever and every SUMIF/QUERY filtering on it matches
    // nothing (falls back to its IFERROR default). Live formula so it
    // tracks the current month on its own; still just a cell, so a sheet
    // owner can overtype it with a specific month to inspect history.
    { range: "Stats!B1", values: [['=TEXT(TODAY(),"YYYY-MM")']] },
    { range: "Stats!A2", values: [["This Month Summary"]] },
    { range: "Stats!A3", values: [["Total Pengeluaran"]] },
    { range: "Stats!B3", values: [["=IFERROR(SUMIF(Transactions!L:L,$B$1,Transactions!F:F),0)"]] },
    { range: "Stats!A4", values: [["Rata-rata Harian"]] },
    { range: "Stats!B4", values: [['=IFERROR(B3/DAY(EOMONTH(DATEVALUE($B$1&"-01"),0)),0)']] },
    { range: "Stats!A5", values: [["Kategori Terbesar"]] },
    { range: "Stats!B5", values: [['=IFERROR(IF($D$46="","–",$D$46),"–")']] },
    { range: "Stats!A6", values: [["Puncak Pengeluaran"]] },
    {
      range: "Stats!B6",
      values: [[
        '=IFERROR(INDEX($A$46:$A$52,MATCH(MAX($B$46:$B$52),$B$46:$B$52,0))&" "&TEXT(DATEVALUE($B$1&"-01"),"MMM"),"–")',
      ]],
    },
    { range: "Stats!A44", values: [["Tren Pengeluaran"]] },
    {
      range: "Stats!A45",
      values: [[
        // Explicit trailing ",0" (0 header rows) — QUERY's header-row
        // auto-detection is unreliable when its source is a virtual
        // FILTER()/array-literal result instead of a real sheet range
        // (can misdetect the first real result row as a header and drop
        // it), silently swallowed by the outer IFERROR into a blank cell.
        '=IFERROR(QUERY(FILTER({' +
          'ARRAYFORMULA(FLOOR((DAY(Transactions!B2:B)-1)/5)*5+1&"-"&' +
          'IF(FLOOR((DAY(Transactions!B2:B)-1)/5)*5+5>DAY(EOMONTH(Transactions!B2:B,0)),' +
          'DAY(EOMONTH(Transactions!B2:B,0)),FLOOR((DAY(Transactions!B2:B)-1)/5)*5+5)), ' +
          'Transactions!F2:F}, Transactions!L2:L=$B$1), ' +
          '"select Col1, sum(Col2) group by Col1 order by Col1 asc label Col1 \'Periode\', sum(Col2) \'Total\'",0),"")',
      ]],
    },
    // Distribusi Kategori / Spend by Wallet / Spend by Month sit beside
    // Tren Pengeluaran (cols D:E, G:H, J:K) instead of stacked below it —
    // Spend by Month has no month filter, so it grows every month the
    // sheet is used; stacking it under three other tables meant scrolling
    // past all of them to compare. Side-by-side, each grows straight down
    // in its own lane with nothing else in the way.
    { range: "Stats!D44", values: [["Distribusi Kategori"]] },
    {
      range: "Stats!D45",
      values: [[
        // Same explicit ",0" fix as Tren Pengeluaran above.
        '=IFERROR(QUERY(FILTER({Transactions!N2:N,Transactions!F2:F}, Transactions!L2:L=$B$1), ' +
          '"select Col1, sum(Col2) group by Col1 order by sum(Col2) desc label Col1 \'Kategori\', sum(Col2) \'Total\'",0),"")',
      ]],
    },
    { range: "Stats!G44", values: [["Spend by Wallet"]] },
    { range: "Stats!G45:H45", values: [["Wallet", "Total spent"]] },
    { range: "Stats!J44", values: [["Spend by Month"]] },
    {
      range: "Stats!J45",
      values: [[
        '=IFERROR(QUERY(Transactions!A2:M,"select Col12, sum(Col6) where Col12 is not null ' +
          'group by Col12 order by Col12 label Col12 \'Bulan\', sum(Col6) \'Total\'",0),"")',
      ]],
    },
  ];
  for (let i = 0; i < WALLET_MAX; i++) {
    const row = 46 + i;
    values.push({
      range: `Stats!G${row}:H${row}`,
      values: [[`=IFERROR(Config!B${i + 2},"")`, `=IF(G${row}="","",SUMIF(Transactions!C:C,G${row},Transactions!F:F))`]],
    });
  }

  await googleFetch(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: values }),
  });

  const requests = [
    colorRange(CONFIG_SHEET_ID, 0, 1, 0, 2, AMBER_DARK, WHITE),
    colorRange(TRANSACTIONS_SHEET_ID, 0, 1, 0, TXN_HEADERS.length, SAGE_DARK, WHITE),
    colorRange(STATS_SHEET_ID, 0, 1, 0, 2, SAGE_LIGHT, TEXT_DARK, { bold: true }),
    mergeRange(STATS_SHEET_ID, 1, 2, 0, 12),
    colorRange(STATS_SHEET_ID, 1, 2, 0, 12, SAGE_DARK, WHITE, { bold: true, center: true }),
    colorRange(STATS_SHEET_ID, 2, 6, 0, 1, SAGE_LIGHT, TEXT_DARK, { bold: false }),
    colorRange(STATS_SHEET_ID, 2, 6, 1, 2, SAGE_LIGHT, TEXT_DARK, { bold: true }),
    mergeRange(STATS_SHEET_ID, 43, 44, 0, 2),
    colorRange(STATS_SHEET_ID, 43, 44, 0, 2, SAGE_DARK, WHITE, { bold: true, center: true }),
    colorRange(STATS_SHEET_ID, 44, 45, 0, 2, SAGE_DARK, WHITE),
    mergeRange(STATS_SHEET_ID, 43, 44, 3, 5),
    colorRange(STATS_SHEET_ID, 43, 44, 3, 5, CORAL_DARK, WHITE, { bold: true, center: true }),
    colorRange(STATS_SHEET_ID, 44, 45, 3, 5, CORAL_DARK, WHITE),
    mergeRange(STATS_SHEET_ID, 43, 44, 6, 8),
    colorRange(STATS_SHEET_ID, 43, 44, 6, 8, AMBER_DARK, WHITE, { bold: true, center: true }),
    colorRange(STATS_SHEET_ID, 44, 45, 6, 8, AMBER_DARK, WHITE),
    mergeRange(STATS_SHEET_ID, 43, 44, 9, 11),
    colorRange(STATS_SHEET_ID, 43, 44, 9, 11, SAGE_DARK, WHITE, { bold: true, center: true }),
    colorRange(STATS_SHEET_ID, 44, 45, 9, 11, SAGE_DARK, WHITE),
    basicChart(STATS_SHEET_ID, "BAR", 44, 60, 6, 8, 0, "Spend by wallet"),
    basicChart(STATS_SHEET_ID, "COLUMN", 44, 145, 9, 8, 6, "Spend by month"),
    pieChart(STATS_SHEET_ID, 44, 53, 3, 24, 0, "Distribusi kategori"),
    basicChart(STATS_SHEET_ID, "LINE", 44, 51, 0, 24, 6, "Tren pengeluaran waktu ke waktu"),
    // Category (col N) — fixed enum, static dropdown list.
    {
      setDataValidation: {
        range: { sheetId: TRANSACTIONS_SHEET_ID, startRowIndex: 1, startColumnIndex: 13, endColumnIndex: 14 },
        rule: {
          condition: { type: "ONE_OF_LIST", values: CATEGORY_LABELS_LIST.map((v) => ({ userEnteredValue: v })) },
          showCustomUi: true,
          strict: true,
        },
      },
    },
    // Wallet (col C) — user-editable/growable list, so validate against
    // the Config sheet's own name range instead of a static list (same
    // 15-row assumption as the Stats "Spend by Wallet" block above).
    {
      setDataValidation: {
        range: { sheetId: TRANSACTIONS_SHEET_ID, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
        rule: {
          condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: "=Config!$B$2:$B$16" }] },
          showCustomUi: true,
          strict: true,
        },
      },
    },
    // Thousands-separator number format on every money cell — Sheets'
    // "#,##0" token renders using the spreadsheet's own locale separator,
    // no hardcoded "," vs "." guess. Transactions!F (Amount) gets its own
    // per-row format on every write instead (see sheets-sync.api.ts's
    // formatRowCells) since rows are appended one at a time after
    // provisioning.
    numberFormatRange(STATS_SHEET_ID, 2, 3, 1, 2), // B3: Total Pengeluaran
    numberFormatRange(STATS_SHEET_ID, 3, 4, 1, 2), // B4: Rata-rata Harian
    numberFormatRange(STATS_SHEET_ID, 44, undefined, 1, 2), // B45:B — Tren Pengeluaran sums
    numberFormatRange(STATS_SHEET_ID, 44, undefined, 4, 5), // E45:E — Distribusi Kategori sums
    numberFormatRange(STATS_SHEET_ID, 45, undefined, 7, 8), // H46:H — Spend by Wallet
    numberFormatRange(STATS_SHEET_ID, 44, undefined, 10, 11), // K45:K — Spend by Month (grows every month)
    // Filter/sort arrows on both sheets' header rows.
    { setBasicFilter: { filter: { range: { sheetId: TRANSACTIONS_SHEET_ID, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: TXN_HEADERS.length } } } },
    { setBasicFilter: { filter: { range: { sheetId: CONFIG_SHEET_ID, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: WALLET_HEADERS.length } } } },
  ];

  await googleFetch(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

/** Checked before provisioning anything — no server stores "which sheet
 * belongs to this email" anywhere; the spreadsheet's own name (a fixed
 * "Month Expense", set at creation) is the only index, so a relogin on a
 * new device finds the same sheet by searching Drive with this user's own
 * access token. `drive.file` scope only ever returns files this app
 * created/opened. */
export async function findExistingSheet(accessToken: string, onStep: (step: ProvisionStep) => void): Promise<ProvisionResult | null> {
  onStep("searching");
  const q = `mimeType='application/vnd.google-apps.spreadsheet' and name='${SHEET_NAME}' and trashed=false`;
  const list = await googleFetch(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id,name)`,
  );
  const file = list.files?.[0] as { id: string; name: string } | undefined;
  if (!file) return null;
  return { spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${file.id}/edit`, spreadsheetId: file.id };
}

/**
 * Runs only when findExistingSheet finds nothing. Creates a brand new
 * blank spreadsheet (not a copy of a template): `drive.file` scope only
 * grants access to files this app creates/opens, and a hardcoded
 * template ID the user never opened wouldn't qualify no matter how it's
 * shared (verified against Drive's own API reference) — creating
 * directly sidesteps that, since `drive.file` explicitly covers files
 * this app creates. Builds the full structure and hands back the
 * spreadsheet id — sheets-sync.api.ts talks to it directly with this same
 * access_token/a silently-refreshed successor, no separate script/
 * deployment step needed anymore.
 */
export async function provisionSheet(accessToken: string, onStep: (step: ProvisionStep) => void): Promise<ProvisionResult> {
  onStep("creating-sheet");
  const spreadsheet = await googleFetch(accessToken, "https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: SHEET_NAME },
      sheets: [
        { properties: { sheetId: CONFIG_SHEET_ID, title: "Config" } },
        { properties: { sheetId: TRANSACTIONS_SHEET_ID, title: "Transactions" } },
        { properties: { sheetId: STATS_SHEET_ID, title: "Stats" } },
      ],
    }),
  });
  const spreadsheetId = spreadsheet.spreadsheetId as string;

  onStep("building-structure");
  await buildSpreadsheetStructure_(accessToken, spreadsheetId);
  // Deliberately not setting "anyone with link" sharing — the owner
  // always has full access to their own file regardless, and this is a
  // private, single-user expense sheet with no reason to be viewable by
  // anyone who merely obtains the URL.

  return { spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, spreadsheetId };
}

// --- Config sheet's syncSecret/connectedEmail cells ----------------------
//
// scripts/mint-secret.ts (BE) is no longer the durable home for a secret —
// it only ever prints one to the terminal once. This is: standard-tier
// secrets are also always re-derivable from the account's email (BE's
// computeSecretForEmail is deterministic), but a manually-minted premium
// secret (random uuid payload) is not — lose it and there's no way to
// regenerate the *same* one. Storing a copy in the user's own spreadsheet
// makes it durable and inspectable without BE needing a database, and
// makes upgrading a user easy: overwrite this cell with a freshly-minted
// premium secret (scripts/mint-secret.ts --premium), no code/redeploy.
// This is pure storage, not a trust decision — BE still independently
// verifies whatever secret shows up in X-Sheet-Secret against its own
// REGULAR_API_KEY/PREMIUM_API_KEY (see be's lib/sheet-identity.ts), so a
// user editing this cell by hand can't forge a tier they weren't given.
const CONFIG_KV_RANGE = "Config!D1:E3";

/** Returns null on anything short of a clean two-row read (sheet created
 * before this existed, transient failure, or genuinely empty) — every
 * caller treats null as "no stored secret yet", not an error. */
export async function readConfigSecret(accessToken: string, spreadsheetId: string): Promise<{ secret: string; email: string } | null> {
  try {
    const json = await googleFetch(
      accessToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(CONFIG_KV_RANGE)}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    const rows: string[][] = json.values ?? [];
    const secret = rows[1]?.[1]; // D2/E2 — row index 1
    if (!secret) return null;
    return { secret, email: rows[2]?.[1] ?? "" }; // D3/E3 — row index 2
  } catch {
    return null;
  }
}

/** Whole-block overwrite (header + 2 rows) — cheap at this size, no
 * partial-cell diffing needed. */
export async function writeConfigSecret(accessToken: string, spreadsheetId: string, secret: string, email: string): Promise<void> {
  await googleFetch(accessToken, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [{ range: CONFIG_KV_RANGE, values: [["Key", "Value"], ["syncSecret", secret], ["connectedEmail", email]] }],
    }),
  });
}
