import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { z } from "zod";
import {
  pullAll,
  pullRecent,
  pushAll,
  applySyncOp,
  validateSheetSecret,
  readCredentials,
  writeCredentials,
  clearCredentials,
} from "./sheets-sync.api";
import { requestGoogleAccessToken } from "./google-auth";
import { mergeById, hasRealLocalData, dedupeWalletsByName, mergeRecentWindow } from "./sync-merge";
import {
  enqueue as enqueueOp,
  readQueue,
  writeQueue,
  STORAGE_KEY as SYNC_QUEUE_KEY,
} from "./sync-queue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { localDateKey } from "@/lib/format";
import { scopedKey, migrateLegacyKey, claimAccountSlot } from "@/lib/account-scope";
import { expenseSchema, type Expense } from "@/features/expense/expense.schema";
import {
  readAll as readExpenses,
  writeAll as writeAllExpenses,
  STORAGE_KEY as EXPENSES_KEY,
} from "@/features/expense/expense.store";
import { walletSchema, type Wallet } from "@/features/wallet/wallet.schema";
import {
  readAll as readWallets,
  writeAll as writeAllWallets,
  STORAGE_KEY as WALLETS_KEY,
} from "@/features/wallet/wallet.store";

// Trailing window (today back 6 days = 7 days total) used by
// pullRecentAndMerge below — purely a client-side filter now (Sheets API
// has no server-side row filtering — see sheets-sync.api.ts's pullRecent),
// but the *behavior* (only this week's data can affect the local merge)
// stays identical to before.
const RECENT_WINDOW_DAYS = 7;

const recentCutoffKey = (): string => {
  return localDateKey(new Date(Date.now() - (RECENT_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000));
};

// Re-exported for existing callers/tests (sync.test.ts imports these from
// here) — the actual implementations live in sync-merge.ts, kept dependency-free
// (no React/localStorage/fetch) so pure list-transform logic stays directly testable.
export { mergeById, hasRealLocalData, dedupeWalletsByName } from "./sync-merge";

const STORAGE_KEY = "expense-notes.sync.v1";
const DEBOUNCE_MS = 800;
const RETRY_MS = 30_000;

const syncStateSchema = z.object({
  status: z.enum(["idle", "synced", "error"]),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  spreadsheetUrl: z.string().nullable(),
});
type SyncState = z.infer<typeof syncStateSchema>;

const IDLE: SyncState = {
  status: "idle",
  lastSyncedAt: null,
  lastError: null,
  spreadsheetUrl: null,
};

const readState = (): SyncState => {
  try {
    migrateLegacyKey(STORAGE_KEY);
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    if (!raw) return IDLE;
    return syncStateSchema.parse(JSON.parse(raw));
  } catch {
    return IDLE;
  }
};

const writeState = (state: SyncState) => {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(state));
};

export type SyncGateStatus = "connected" | "disconnected";

/** Surfaced by ConnectGate so a several-second connect doesn't just sit on
 * a static "Connecting…" label — each phase gets its own copy. */
export type ConnectStep = "verifying" | "merging" | "saving" | null;

/**
 * The connected spreadsheet is this app's identity now (see ConnectGate) —
 * not an optional backup. `gateStatus` gates the entire app in App.tsx.
 * BE is out of this entirely (see sheets-sync.api.ts — every call here
 * goes straight to Google Sheets API with this device's own OAuth token),
 * so "connected" is purely "does this device have credentials stored" —
 * synchronous, no network round-trip needed just to know that.
 */
export const useSheetsSync = (
  setExpenses: Dispatch<SetStateAction<Expense[]>>,
  setWallets: Dispatch<SetStateAction<Wallet[]>>,
) => {
  const [state, setState] = useState<SyncState>(readState);
  const [gateStatus, setGateStatus] = useState<SyncGateStatus>(() =>
    readCredentials() ? "connected" : "disconnected",
  );
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectStep, setConnectStep] = useState<ConnectStep>(null);
  // Bumped by notifyExpenseUpsert/etc below to retrigger the queue-flush
  // debounce effect — the queue itself lives in localStorage (sync-queue.ts),
  // not React state, so something reactive is needed to know it changed.
  const [queueTick, setQueueTick] = useState(0);
  // Surfaced as a one-off "you've been logged out" modal in App.tsx — see
  // flushQueue()/pullRecentAndMerge()'s SHEET_DELETED branch below.
  const [sheetDeletedNotice, setSheetDeletedNotice] = useState(false);
  // "The cached token's gone/expired, click to silently refresh" —
  // doesn't touch credentials/gateStatus, since a fresh token is only
  // ever a click away (see retryGoogleAuth). A failed *attempt* to
  // refresh (blocked/closed popup, network blip) isn't proof the
  // connection itself is gone — only a confirmed SHEET_DELETED
  // (handleAuthError above, a real 403/404 from Sheets API) is — so this
  // stays open with reauthError set instead of escalating to a full
  // disconnect.
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const online = useOnlineStatus();

  // Shared by flushQueue()'s catch and pullRecentAndMerge() below — both need
  // to react the same way to a gone/inaccessible sheet. Returns whether it
  // recognized and already handled the code, so callers know whether to
  // fall through to their own generic-error handling.
  const handleAuthError = useCallback(
    (error: unknown): boolean => {
      const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
      if (code === "SHEET_DELETED") {
        clearCredentials();
        setGateStatus("disconnected");
        setSheetDeletedNotice(true);
        return true;
      }
      // Only while online: a silent-renewal failure with no network just
      // means "no network," not "your session is gone" — this app is
      // local-first/offline-first by design, so it shouldn't kick the user
      // to a reconnect screen just because they're on a subway.
      if (code === "GOOGLE_AUTH_FAILED" && online) {
        setNeedsReauth(true);
        return true;
      }
      return false;
    },
    [online],
  );

  /** Applies whatever's currently queued (sync-queue.ts) one op at a time,
   * removing each from the persisted queue only once it actually lands
   * (see applySyncOp's own comment) — the everyday create/edit/delete path.
   * Cheap no-op if the queue's empty. On failure, schedules a retry after
   * 30s (Sheets API's real per-minute quotas make a transient failure the
   * common case, not the exception) instead of just sitting in
   * status:"error" until some unrelated trigger (queueTick/online change)
   * happens to fire — cleared the moment a flush succeeds or the queue
   * empties. */
  const flushQueue = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const credentials = readCredentials();
    if (!credentials) return;
    if (readQueue().length === 0) return;
    setSyncing(true);
    try {
      while (true) {
        const queue = readQueue();
        if (queue.length === 0) break;
        const [op, ...rest] = queue;
        if (op!.type === "restoreFromSheets") {
          const { expenses, wallets } = await pullAndMergeRestore(credentials.spreadsheetId);
          setExpenses(expenses);
          setWallets(wallets);
        } else {
          await applySyncOp(credentials.spreadsheetId, op!);
        }
        writeQueue(rest);
      }
      const next: SyncState = {
        ...readState(),
        status: "synced",
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      };
      writeState(next);
      setState(next);
    } catch (error) {
      if (handleAuthError(error)) return;
      const next: SyncState = {
        ...readState(),
        status: "error",
        lastError: error instanceof Error ? error.message : "Sync failed",
      };
      writeState(next);
      setState(next);
      retryTimerRef.current = setTimeout(() => void flushQueue(), RETRY_MS);
    } finally {
      setSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleAuthError, setExpenses, setWallets]);

  // Each enqueues one row's change (sync-queue.ts) and nudges the debounced
  // flush effect below — App.tsx calls these right alongside addExpense/
  // updateExpense/removeExpense/addWallet/renameWallet/removeWallet.
  // Upserts take `| undefined` so a caller can pass updateExpense/
  // renameWallet's result straight through without an extra not-found check.
  const notifyExpenseUpsert = useCallback((expense: Expense | undefined) => {
    if (!expense) return;
    enqueueOp({ type: "upsertExpense", expense });
    setQueueTick((t) => t + 1);
  }, []);
  const notifyExpenseDelete = useCallback((id: string) => {
    enqueueOp({ type: "deleteExpense", id });
    setQueueTick((t) => t + 1);
  }, []);
  const notifyWalletUpsert = useCallback((wallet: Wallet | undefined) => {
    if (!wallet) return;
    enqueueOp({ type: "upsertWallet", wallet });
    setQueueTick((t) => t + 1);
  }, []);
  const notifyWalletDelete = useCallback((id: string) => {
    enqueueOp({ type: "deleteWallet", id });
    setQueueTick((t) => t + 1);
  }, []);

  /** Restore is just another queued op (see flushQueue's special case
   * above) — no page reload, no one-shot alert-and-give-up. If it fails
   * it stays queued and retries automatically like any other pending
   * sync op; re-clicking collapses onto the one already pending
   * (sync-queue.ts's dedupe-by-target). */
  const enqueueRestore = useCallback(() => {
    enqueueOp({ type: "restoreFromSheets" });
    setQueueTick((t) => t + 1);
  }, []);

  /**
   * Pulls the trailing 7-day window (see pullRecent) and merges it in with
   * sheet-wins-on-conflict semantics: everything outside the window is left
   * alone, everything inside it is replaced wholesale by whatever the sheet
   * has — covers both "another device added/edited something here" and
   * "another device deleted something here" (a sheet-side delete just
   * doesn't reappear in the pulled window). Wallets are always small, so
   * they're replaced wholesale too (skipped if the sheet somehow came back
   * with none, same defensive check connect() uses). Runs on a fresh app
   * open and every offline→online reconnect (see App.tsx's effect calling
   * this via `verifyConnection`) — best-effort, catch-and-ignore (a one-off
   * network blip or an expired-and-unrenewable token shouldn't surface as a
   * sync error for what's just an opportunistic catch-up).
   */
  const pullRecentAndMerge = useCallback(async () => {
    const credentials = readCredentials();
    if (!credentials) return;
    try {
      const { expenses: recent, wallets: sheetWallets } = await pullRecent(
        credentials.spreadsheetId,
        recentCutoffKey(),
      );
      const cutoff = recentCutoffKey();
      setExpenses((prev) => {
        const merged = mergeRecentWindow(prev, recent, cutoff);
        writeAllExpenses(merged);
        return merged;
      });
      if (sheetWallets.length > 0) {
        writeAllWallets(sheetWallets);
        setWallets(sheetWallets);
      }
    } catch (error) {
      handleAuthError(error);
    }
  }, [handleAuthError, setExpenses, setWallets]);

  /** Runs on a fresh app open and on every offline→online reconnect (see
   * App.tsx) — flushes anything still queued from before the reconnect
   * first (so the sheet reflects this device's own edits), then pulls the
   * recent window to catch up on anything another device wrote in the
   * meantime (see pullRecentAndMerge). Order matters: pulling before the
   * flush lands could otherwise let a stale sheet response overwrite edits
   * that are queued but not yet sent. */
  const verifyConnection = useCallback(async () => {
    if (!readCredentials()) return;
    await flushQueue();
    await pullRecentAndMerge();
  }, [flushQueue, pullRecentAndMerge]);

  /** Called from the "Continue with Google" click in the needsReauth
   * modal (App.tsx) — a real click, so requestGoogleAccessToken's popup
   * is a real user-gesture-triggered one, reliably allowed (unlike the
   * background silent-renewal attempt this replaces — see
   * getFreshAccessToken's comment). Success just needed a fresh token,
   * nothing else was ever wrong — resume whatever sync was pending.
   * Failure here (blocked/closed popup, network blip) is *not* proof the
   * account/spreadsheet connection itself is gone — only a confirmed
   * SHEET_DELETED is — so this leaves credentials/gateStatus untouched
   * and just surfaces the error in the same modal for another click,
   * instead of forcing the whole ConnectGate re-provision flow for what
   * a second attempt might resolve on its own. */
  const retryGoogleAuth = useCallback(async () => {
    try {
      await requestGoogleAccessToken();
      setNeedsReauth(false);
      setReauthError(null);
      void verifyConnection();
    } catch (err) {
      setReauthError(
        err instanceof Error ? err.message : "Google sign-in failed. Please try again.",
      );
    }
  }, [verifyConnection]);

  /**
   * The only connect path — always explicit credentials (ConnectGate's
   * form, already holding a spreadsheetId from search/provision). Merges
   * with this device's own pre-existing local data if it has any real data
   * of its own (see hasRealLocalData), otherwise a pure pull. Reads fresh
   * from the store directly rather than this render's expenses/wallets
   * params, so this has no prop dependency. Throws on any failure —
   * ConnectGate shows it inline, gateStatus stays "disconnected".
   */
  const connect = useCallback(
    async (spreadsheetId: string, spreadsheetUrl: string, secret: string, email: string) => {
      setConnectStep("verifying");
      // Confirms this secret was actually minted by our system (not made up
      // by a user) before touching any local data — see sheets-sync.api.ts.
      await validateSheetSecret(secret, spreadsheetId);
      writeCredentials({ secret, spreadsheetId, email });

      // Claims this device's per-account local data slot for `email` BEFORE
      // reading "local" expenses/wallets below — a different email than
      // whatever was last claimed here starts from its own slot (empty, or
      // its own previous data), never merging in a different account's
      // leftover local data (see account-scope.ts).
      claimAccountSlot(email, [EXPENSES_KEY, WALLETS_KEY, SYNC_QUEUE_KEY, STORAGE_KEY]);

      setConnectStep("merging");
      const { expenses: sheetExpenses, wallets: sheetWallets } = await pullAll(spreadsheetId);
      const localExpenses = readExpenses();
      const localWallets = readWallets();
      const merging = hasRealLocalData(localExpenses, localWallets);

      const mergedExpenses = merging ? mergeById(sheetExpenses, localExpenses) : sheetExpenses;
      const mergedWallets = merging
        ? mergeById(sheetWallets, localWallets)
        : sheetWallets.length > 0
          ? sheetWallets
          : localWallets;
      // Each device auto-seeds its own default "Main Wallet" with its own
      // id — mergeById alone would let two distinct-id, same-name wallets
      // both survive here.
      const { wallets: finalWallets, expenses: finalExpenses } = dedupeWalletsByName(
        mergedWallets,
        mergedExpenses,
      );

      writeAllExpenses(finalExpenses);
      writeAllWallets(finalWallets);

      setConnectStep("saving");
      await pushAll(spreadsheetId, finalExpenses, finalWallets);
      const next: SyncState = {
        status: "synced",
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        spreadsheetUrl,
      };
      writeState(next);
      setState(next);
      setGateStatus("connected");

      // No setter to refresh useExpenses()/useWallets()'s own React state
      // from here — reload is the simplest correct way every hook re-reads
      // localStorage fresh. Unlike restoreFromSheets's old reload (now gone
      // — see pullAndMergeRestore/flushQueue below, which update React state
      // directly), this one only ever runs once, right after a fresh login.
      if (typeof window !== "undefined") window.location.reload();
    },
    [],
  );

  const connectWithCredentials = useCallback(
    async (spreadsheetId: string, spreadsheetUrl: string, secret: string, email: string) => {
      setConnecting(true);
      try {
        await connect(spreadsheetId, spreadsheetUrl, secret, email);
      } finally {
        setConnecting(false);
        setConnectStep(null);
      }
    },
    [connect],
  );

  // Debounced queue flush: every notifyExpenseUpsert/etc bumps queueTick,
  // so a burst of edits collapses into one flush pass instead of one per
  // mutation. Only once connected and online — offline just leaves the
  // queue sitting in localStorage until verifyConnection's reconnect flush
  // (see App.tsx) picks it up.
  useEffect(() => {
    if (gateStatus !== "connected") return;
    if (!online) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushQueue(), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueTick, gateStatus, online]);

  // The 30s retry timer (flushQueue's own catch) is scoped to this hook
  // instance — clear it on unmount so a stale retry never fires against an
  // unmounted app (StrictMode double-invoke, route change, etc.).
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const retrySync = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void verifyConnection();
  }, [verifyConnection]);

  /** Disconnects this device from the sheet — clears the stored
   * credentials and drops back to ConnectGate. Doesn't touch local
   * expenses/wallets/recurring data (same "disconnect, don't delete"
   * semantics as the SHEET_DELETED auto-kickback above); reconnecting to
   * the same or a different sheet runs through connect()'s usual merge
   * logic. */
  const disconnect = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    clearCredentials();
    setGateStatus("disconnected");
  }, []);

  return {
    gateStatus,
    connecting,
    connectStep,
    connect: connectWithCredentials,
    disconnect,
    status: state.status,
    syncing,
    lastSyncedAt: state.lastSyncedAt,
    lastError: state.lastError,
    spreadsheetUrl: state.spreadsheetUrl,
    retrySync,
    notifyExpenseUpsert,
    notifyExpenseDelete,
    notifyWalletUpsert,
    notifyWalletDelete,
    enqueueRestore,
    sheetDeletedNotice,
    dismissSheetDeletedNotice: () => setSheetDeletedNotice(false),
    needsReauth,
    reauthError,
    retryGoogleAuth,
    dismissNeedsReauth: () => {
      setNeedsReauth(false);
      setReauthError(null);
    },
    verifyConnection,
  };
};

/**
 * Reconciles, doesn't nuke: same trailing-7-day-window logic as
 * pullRecentAndMerge above (sheet wins inside the window, everything older
 * is this device's own business and stays untouched) — not a full pull +
 * blind overwrite. Wallets have no date to window on, so they get the same
 * union-by-id/sheet-wins-on-collision merge connect() uses.
 *
 * Called from flushQueue's "restoreFromSheets" op branch, not directly —
 * credentials-check/retry-on-failure/persistence-across-reload all belong
 * to the queue now (see enqueueRestore), same as every other sync op, so
 * this only does the pull+merge+write and hands back what to put in React
 * state. No reload: the caller applies the result via setExpenses/
 * setWallets directly. Exported (not just called inline from flushQueue)
 * so it stays unit-testable on its own, same as mergeById/mergeRecentWindow.
 */
export const pullAndMergeRestore = async (
  spreadsheetId: string,
): Promise<{ expenses: Expense[]; wallets: Wallet[] }> => {
  const cutoff = recentCutoffKey();
  const { expenses: recentExpenses, wallets: sheetWallets } = await pullRecent(
    spreadsheetId,
    cutoff,
  );
  const mergedExpenses = z
    .array(expenseSchema)
    .parse(mergeRecentWindow(readExpenses(), recentExpenses, cutoff));
  const mergedWallets = z.array(walletSchema).parse(mergeById(sheetWallets, readWallets()));
  writeAllExpenses(mergedExpenses);
  writeAllWallets(mergedWallets);
  return { expenses: mergedExpenses, wallets: mergedWallets };
};
