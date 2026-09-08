import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Scanner } from "@/components/scanner/Scanner";
import { ManualEntryForm } from "@/components/expense/ManualEntryForm";
import { VoiceEntry } from "@/components/expense/VoiceEntry";
import { TextReceiptEntry } from "@/components/expense/TextReceiptEntry";
import { ExpenseDetailModal } from "@/components/expense/ExpenseDetailModal";
import { WalletSettingsPage } from "@/components/wallet/WalletSettingsPage";
import { ConnectGate } from "@/components/sync/ConnectGate";
import { PrivacyPolicyPage } from "@/components/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "@/components/legal/TermsOfServicePage";
import { AboutPage } from "@/components/legal/AboutPage";
import { NotFoundPage } from "@/components/legal/NotFoundPage";
import { AppShell, type AppTab } from "@/components/layout/AppShell";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { TransactionsPage } from "@/components/transactions/TransactionsPage";
import { ExpenseSchedulePage } from "@/components/schedule/ExpenseSchedulePage";
import { AnalyticsPage } from "@/components/analytics/AnalyticsPage";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PwaUpdateModal } from "@/components/pwa/PwaUpdateModal";
import { t, translateBackendMessage } from "@/i18n/translations";
import { useExpenses } from "@/features/expense/expense.store";
import { useWallets } from "@/features/wallet/wallet.store";
import { useSheetsSync } from "@/features/sync/sync.store";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { warmUpOcr } from "@/features/ocr/ocr.client";
import { getQuotaStatus } from "@/features/receipt/receipt.api";
import { recordQuota } from "@/lib/entry-quota";
import { purgeExpiredImages } from "@/lib/image/image-store";
import { nudgeViewport } from "@/lib/viewport-nudge";
import type { Expense, ExpenseInput, ExpenseSource } from "@/features/expense/expense.schema";
import type { WalletAnimal } from "@/features/wallet/wallet.schema";

type EntryFlow = "scan" | "manual" | "voice" | "text" | null;

const App = () => {
  const { expenses, addExpense, removeExpense, updateExpense, setExpenses } = useExpenses();
  const { wallets, addWallet, renameWallet, updateWalletAnimal, removeWallet, setWallets } =
    useWallets();
  const sync = useSheetsSync(setExpenses, setWallets);

  // Each wraps a store mutator with the matching sync.notify* — the
  // incremental "mutate" queue (sync.store.ts) needs to know exactly what
  // changed, not just that expenses/wallets changed, so every mutation
  // path in this component goes through one of these instead of the raw
  // store function directly.
  const handleAddExpense = (input: ExpenseInput, source: ExpenseSource) => {
    const entry = addExpense(input, source);
    sync.notifyExpenseUpsert(entry);
    return entry;
  };
  const handleUpdateExpense = (id: string, patch: Partial<ExpenseInput>) => {
    const updated = updateExpense(id, patch);
    sync.notifyExpenseUpsert(updated);
    return updated;
  };
  const handleRemoveExpense = (id: string) => {
    removeExpense(id);
    sync.notifyExpenseDelete(id);
  };
  const handleAddWallet = (name: string, animal: WalletAnimal) => {
    const result = addWallet(name, animal);
    sync.notifyWalletUpsert(result.wallet);
    return result.added;
  };
  const handleRenameWallet = (id: string, name: string) => {
    const updated = renameWallet(id, name);
    sync.notifyWalletUpsert(updated);
  };
  const handleUpdateWalletAnimal = (id: string, animal: WalletAnimal) => {
    const updated = updateWalletAnimal(id, animal);
    sync.notifyWalletUpsert(updated);
  };
  const handleRemoveWallet = (id: string) => {
    const removed = removeWallet(id, expenses);
    if (removed) sync.notifyWalletDelete(id);
    return removed;
  };
  const { theme, toggleTheme } = useTheme();
  const { lang, setLanguage } = useLanguage();
  const online = useOnlineStatus();
  const [tab, setTab] = useState<AppTab>("home");
  const [entryFlow, setEntryFlow] = useState<EntryFlow>(null);
  // Closes whatever entry-flow sheet is open, then nudges the viewport
  // (see viewport-nudge.ts) — covers the pattern this bug is most
  // reliably seen in (right after saving/discarding an expense), on
  // top of the mount-time nudge below covering cold launch itself.
  const closeEntryFlow = () => {
    setEntryFlow(null);
    nudgeViewport();
  };
  // Cold-launch is the actual root case (confirmed: the gap can survive
  // a full reload) — nudge once up front before the user does anything.
  useEffect(() => {
    nudgeViewport();
  }, []);
  // Latches the last non-null entryFlow — the Voice/Manual sheet below
  // stays showing whatever it was showing all the way through its own
  // close animation instead of the ternary flipping content the instant
  // entryFlow clears to null (which used to swap VoiceEntry for the much
  // taller ManualEntryForm mid-close, glitching the sheet's height).
  // Derived during render (React's "adjusting state when a prop changes"
  // pattern) instead of a ref read during render.
  const [displayFlow, setDisplayFlow] = useState<EntryFlow>(entryFlow);
  if (entryFlow !== null && entryFlow !== displayFlow) setDisplayFlow(entryFlow);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  // Same latch as displayFlow above — keeps the form mounted with its last
  // real expense through the sheet's close animation instead of unmounting
  // the instant editingExpense clears to null.
  const [displayEditingExpense, setDisplayEditingExpense] = useState<Expense | null>(null);
  if (editingExpense && editingExpense !== displayEditingExpense)
    setDisplayEditingExpense(editingExpense);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  // Scan drawer only needs to be tall while the camera preview is
  // actually expanded — otherwise it should size to its content like
  // every other sheet (see Scanner.tsx/LiveCameraCapture.tsx). This used
  // to also force full height while the AI result preview
  // (ExpenseReviewModal) was showing, but max-h + the inner flex-1
  // scroll div already grow to content (capped at 92dvh) on their own —
  // forcing full height regardless left dead space below Save/Discard
  // on short results instead of shrinking to fit.
  const [scanExpanded, setScanExpanded] = useState(false);

  // Nobody's connected → nothing to show. Local storage may still be
  // sitting on a previous (now-disconnected) account's data — see
  // account-scope.ts — so every *display* consumer gets an empty view
  // instead of leaking it before the right account (re)connects. Mutators
  // (handleAddExpense/etc. below) and sync.store.ts's own connect()-time
  // merge logic keep reading the real expenses/wallets directly; this only
  // affects what's rendered.
  const visibleExpenses = sync.gateStatus === "connected" ? expenses : [];
  const visibleWallets = sync.gateStatus === "connected" ? wallets : [];
  const defaultWalletId = visibleWallets[0]?.id ?? "";

  useEffect(() => {
    warmUpOcr();
    void purgeExpiredImages();
  }, []);

  // Prefetch today's quota the moment we're connected — best-effort, so
  // the Scan/Voice/Text badges show real numbers immediately instead of
  // only after a first completed entry (see src/lib/entry-quota.ts).
  useEffect(() => {
    if (sync.gateStatus !== "connected") return;
    getQuotaStatus()
      .then((quota) => {
        recordQuota("scan", quota.scan);
        recordQuota("voice", quota.voice);
        recordQuota("text", quota.text);
      })
      .catch(() => {});
  }, [sync.gateStatus]);

  // Flush anything queued from before a reload/reconnect, then pull the
  // recent window to catch up on other devices' changes — runs on a fresh
  // app open and every offline→online flip (see sync.store.ts's
  // verifyConnection()). Gated on `online` too: a fetch failure can't be
  // told apart from "no network" on its own, and opening the app offline
  // shouldn't get wrongly diagnosed as a deleted sheet (see
  // sheets-sync.api.ts's post()).
  useEffect(() => {
    if (sync.gateStatus !== "connected" || !online) return;
    void sync.verifyConnection();
  }, [sync.gateStatus, online]);

  // Adding an expense needs a connected sheet to push to — gate at the
  // point of use instead of the whole app. See ConnectGate.tsx. (Browsing
  // is also effectively gated now: every display consumer below reads
  // visibleExpenses/visibleWallets, empty while disconnected.)
  const requestEntryFlow = (flow: Exclude<EntryFlow, null>) => {
    if (sync.gateStatus !== "connected") {
      setConnectOpen(true);
      return;
    }
    setEntryFlow(flow);
  };

  // Explicit whitelist — an unrecognized path used to silently fall
  // through to the normal home shell below; now it gets a real 404.
  // Google login has no route of its own anymore — Identity Services runs
  // entirely via popups from ConnectGate, no full-page redirect involved.
  if (typeof window !== "undefined" && window.location.pathname !== "/") {
    const { pathname } = window.location;
    if (pathname === "/privacy") return <PrivacyPolicyPage />;
    if (pathname === "/terms") return <TermsOfServicePage />;
    if (pathname === "/about") return <AboutPage />;
    return <NotFoundPage />;
  }

  return (
    <AppShell
      tab={tab}
      onTabChange={setTab}
      theme={theme}
      onToggleTheme={toggleTheme}
      lang={lang}
      onChangeLang={setLanguage}
      onScan={() => requestEntryFlow("scan")}
      onVoice={() => requestEntryFlow("voice")}
      onText={() => requestEntryFlow("text")}
      onManual={() => requestEntryFlow("manual")}
      gateStatus={sync.gateStatus}
      onRequireConnect={() => setConnectOpen(true)}
    >
      {tab === "home" && (
        <HomeDashboard
          expenses={visibleExpenses}
          wallets={visibleWallets}
          onManageRecurring={() => setTab("recurring")}
          onOpenWallets={() =>
            sync.gateStatus === "connected" ? setWalletsOpen(true) : setConnectOpen(true)
          }
          onScan={() => requestEntryFlow("scan")}
          onVoice={() => requestEntryFlow("voice")}
          onText={() => requestEntryFlow("text")}
          onManual={() => requestEntryFlow("manual")}
          onConnect={() => setConnectOpen(true)}
          sync={sync}
          lang={lang}
          online={online}
        />
      )}
      {tab === "transactions" && (
        <TransactionsPage
          expenses={visibleExpenses}
          wallets={visibleWallets}
          onSelect={setSelectedExpense}
          lang={lang}
        />
      )}
      {tab === "analytics" && <AnalyticsPage expenses={visibleExpenses} lang={lang} />}
      {tab === "recurring" && (
        <ExpenseSchedulePage
          expenses={visibleExpenses}
          onUpdateExpense={handleUpdateExpense}
          onSelectExpense={setSelectedExpense}
          lang={lang}
        />
      )}

      <ExpenseDetailModal
        expense={selectedExpense}
        wallets={visibleWallets}
        onClose={() => setSelectedExpense(null)}
        onSave={handleUpdateExpense}
        onRemove={handleRemoveExpense}
        onEdit={(expense) => {
          setSelectedExpense(null);
          setEditingExpense(expense);
        }}
        lang={lang}
      />

      <BottomSheet
        open={editingExpense !== null}
        onClose={() => setEditingExpense(null)}
        title={t(lang, "saveChanges")}
        className="max-h-[85dvh] flex flex-col"
      >
        <h3 className="shrink-0 pt-1 pb-1 text-sm font-bold text-ink">{t(lang, "saveChanges")}</h3>
        {/* min-h-0: a flex child's default min-height:auto refuses to
            shrink below its content — without it flex-1 can't actually
            force this to respect the sheet's own max-height, and
            overflow-y-auto never gets a bounded box to scroll within.
            overflow-y-auto belongs on this nested div, not the sheet's
            own Content element — vaul marks that touch-action:none
            unconditionally for its own gesture tracking, so native
            scroll never engaged there no matter what (see
            NotificationDrawer.tsx, which already does this correctly). */}
        <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
          {displayEditingExpense && (
            <ManualEntryForm
              key={displayEditingExpense.id}
              expense={displayEditingExpense}
              wallets={visibleWallets}
              defaultWalletId={defaultWalletId}
              lang={lang}
              submitLabel={t(lang, "saveChanges")}
              onSubmit={(input) => {
                handleUpdateExpense(displayEditingExpense.id, input);
                setEditingExpense(null);
              }}
            />
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={t(lang, "connectTitle")}
      >
        <ConnectGate
          onConnect={sync.connect}
          connecting={sync.connecting}
          connectStep={sync.connectStep}
          lang={lang}
        />
      </BottomSheet>

      <WalletSettingsPage
        open={walletsOpen}
        onClose={() => setWalletsOpen(false)}
        wallets={visibleWallets}
        expenses={visibleExpenses}
        onAdd={handleAddWallet}
        onRename={handleRenameWallet}
        onUpdateAnimal={handleUpdateWalletAnimal}
        onRemove={handleRemoveWallet}
      />

      <BottomSheet
        open={entryFlow === "scan"}
        onClose={() => {
          closeEntryFlow();
          // Defensive: dismissible={false} below should already prevent
          // this from ever closing while expanded, but a future/other
          // dismiss path (Escape key, programmatic close) shouldn't be
          // able to leave this stuck true for the next open either.
          setScanExpanded(false);
        }}
        title={t(lang, "scanReceiptCard")}
        className={scanExpanded ? "h-[92dvh] flex flex-col" : "max-h-[92dvh] flex flex-col"}
        // Swiping down while the camera is fullscreen used to close the
        // whole sheet (losing the in-progress scan) instead of just
        // backing out of fullscreen — disable swipe/outside-tap dismiss
        // while expanded; the explicit X in LiveCameraCapture is the only
        // way out, and it already resets scanExpanded correctly.
        dismissible={!scanExpanded}
      >
        <h3 className="shrink-0 pt-1 pb-1 text-sm font-bold text-ink">
          {t(lang, "scanReceiptCard")}
        </h3>
        <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
          <Scanner
            addExpense={handleAddExpense}
            wallets={visibleWallets}
            defaultWalletId={defaultWalletId}
            active={entryFlow === "scan"}
            lang={lang}
            onExpandChange={setScanExpanded}
            onSaved={closeEntryFlow}
          />
        </div>
      </BottomSheet>

      <BottomSheet
        open={entryFlow !== null && entryFlow !== "scan"}
        onClose={closeEntryFlow}
        title={
          displayFlow === "voice"
            ? t(lang, "voiceCard")
            : displayFlow === "text"
              ? t(lang, "textReceiptCardTitle")
              : t(lang, "manualCard")
        }
        className="max-h-[92dvh] flex flex-col"
      >
        <h3 className="shrink-0 pt-1 pb-1 text-sm font-bold text-ink">
          {displayFlow === "voice"
            ? t(lang, "voiceCard")
            : displayFlow === "text"
              ? t(lang, "textReceiptCardTitle")
              : t(lang, "manualCard")}
        </h3>
        <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
          {displayFlow === "voice" ? (
            <VoiceEntry
              wallets={visibleWallets}
              defaultWalletId={defaultWalletId}
              lang={lang}
              onSubmit={(input) => {
                handleAddExpense(input, "voice");
                closeEntryFlow();
              }}
            />
          ) : displayFlow === "text" ? (
            <TextReceiptEntry
              wallets={visibleWallets}
              defaultWalletId={defaultWalletId}
              lang={lang}
              onSubmit={(input) => {
                handleAddExpense(input, "manual");
                closeEntryFlow();
              }}
            />
          ) : (
            <ManualEntryForm
              wallets={visibleWallets}
              defaultWalletId={defaultWalletId}
              lang={lang}
              onSubmit={(input) => {
                handleAddExpense(input, "manual");
                closeEntryFlow();
              }}
            />
          )}
        </div>
      </BottomSheet>

      <PwaUpdateModal lang={lang} />

      <Dialog
        open={sync.sheetDeletedNotice}
        onOpenChange={(open) => !open && sync.dismissSheetDeletedNotice()}
      >
        <DialogContent className="sm:max-w-xs text-center">
          <DialogHeader className="items-center">
            <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400" />
            <DialogTitle>{t(lang, "sheetDeletedTitle")}</DialogTitle>
            <DialogDescription>{t(lang, "sheetDeletedBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={sync.dismissSheetDeletedNotice}>
              {t(lang, "sheetDeletedOk")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sync.needsReauth} onOpenChange={(open) => !open && sync.dismissNeedsReauth()}>
        <DialogContent className="sm:max-w-xs text-center">
          <DialogHeader className="items-center">
            <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-400" />
            <DialogTitle>{t(lang, "needsReauthTitle")}</DialogTitle>
            <DialogDescription>{t(lang, "needsReauthBody")}</DialogDescription>
          </DialogHeader>
          {sync.reauthError && (
            <p className="text-center text-sm text-[var(--color-error)]">
              {translateBackendMessage(sync.reauthError, lang)}
            </p>
          )}
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button className="w-full" onClick={sync.retryGoogleAuth}>
              {t(lang, "googleLoginButton")}
            </Button>
            <Button className="w-full" variant="outline" onClick={sync.dismissNeedsReauth}>
              {t(lang, "cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

export default App;
