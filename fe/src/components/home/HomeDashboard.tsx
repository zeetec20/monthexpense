import { useMemo, useRef, useState } from "react";
import { subMonths, parseISO } from "date-fns";
import {
  Bell,
  Plus,
  ScanLine,
  Mic,
  ClipboardPaste,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
  ChartColumnStacked,
} from "lucide-react";
import { SyncMenu } from "@/components/sync/SyncMenu";
import { WarningCallout } from "@/components/ui/WarningCallout";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { AnimalAvatar } from "@/components/ui/AnimalAvatar";
import { ReminderBanner } from "@/components/expense/ReminderBanner";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import { formatCurrency, localMonthKey } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isCountedExpense, upcomingScheduleItems } from "@/features/expense/schedule";
import { useSeenReminders } from "@/hooks/useSeenReminders";
import { useEntryQuota } from "@/hooks/useEntryQuota";
import { categoryColor, categoryIcon, categoryLabel } from "@/features/expense/category-visuals";
import { t, type Lang } from "@/i18n/translations";
import { EXPENSE_CATEGORIES, type Expense } from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";

const monthKey = localMonthKey;
const monthLabel = (key: string, lang: Lang) =>
  new Date(`${key}-01`).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
    month: "long",
    year: "numeric",
  });

/**
 * Literal port of expense-tracker's HomeView.tsx. The profile-avatar slot
 * becomes SyncMenu (this app's identity is the connected sheet, not a user
 * profile — the one deliberate content swap); everything else (wallet
 * carousel, quick actions, spending summary) matches structure/classes.
 */
export const HomeDashboard = ({
  expenses,
  wallets,
  onManageRecurring,
  onOpenWallets,
  onScan,
  onVoice,
  onText,
  onManual,
  onConnect,
  sync,
  lang,
  online,
}: {
  expenses: Expense[];
  wallets: Wallet[];
  onManageRecurring: () => void;
  onOpenWallets: () => void;
  onScan: () => void;
  onVoice: () => void;
  onText: () => void;
  onManual: () => void;
  onConnect: () => void;
  sync: {
    gateStatus: "connected" | "disconnected";
    syncing: boolean;
    status: "idle" | "synced" | "error";
    lastSyncedAt: string | null;
    spreadsheetUrl: string | null;
    retrySync: () => void;
    disconnect: () => void;
    enqueueRestore: () => void;
  };
  lang: Lang;
  /** Scan/Voice/Text are fully network-dependent — each shows a "no
   * internet" panel inside its own drawer when offline (see Scanner.tsx/
   * VoiceEntry.tsx/TextReceiptEntry.tsx). Manual entry unaffected. */
  online: boolean;
}) => {
  const months = useMemo(() => {
    const keys = new Set(expenses.map((e) => e.date.slice(0, 7)));
    keys.add(monthKey(new Date()));
    return [...keys].sort().reverse();
  }, [expenses]);
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));

  const [activeCard, setActiveCard] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scanQuota = useEntryQuota("scan");
  const voiceQuota = useEntryQuota("voice");
  const textQuota = useEntryQuota("text");

  const currency = expenses[0]?.currency ?? "IDR";
  // isCountedExpense: a settled Hutang doesn't count as real spend anymore.
  const monthExpenses = expenses.filter(
    (e) => e.date.startsWith(selectedMonth) && isCountedExpense(e),
  );

  // Per-wallet monthly spend + a 4-bucket mini bar graph, same shape as
  // expense-tracker's accountCards. isUp compares against the month right
  // before whichever one is selected (not always literally "last calendar
  // month" — the picker can view a past month) — same zero-previous-data-
  // defaults-to-up rule as AnalyticsPage.tsx's real trend.
  const walletCards = useMemo(() => {
    const prevMonthKey = localMonthKey(subMonths(parseISO(`${selectedMonth}-01`), 1));
    const prevMonthExpenses = expenses.filter(
      (e) => e.date.startsWith(prevMonthKey) && isCountedExpense(e),
    );
    return wallets.map((wallet) => {
      const walletTxs = monthExpenses.filter((e) => e.walletId === wallet.id);
      const total = walletTxs.reduce((sum, e) => sum + e.amount, 0);
      const prevTotal = prevMonthExpenses
        .filter((e) => e.walletId === wallet.id)
        .reduce((sum, e) => sum + e.amount, 0);
      const isUp = prevTotal === 0 ? true : total > prevTotal;
      const buckets = [0, 0, 0, 0];
      walletTxs.forEach((e) => {
        const day = Number(e.date.split("-")[2] ?? "1");
        const idx = Math.min(3, Math.floor((day - 1) / 8));
        buckets[idx] += e.amount;
      });
      const max = Math.max(...buckets, 1);
      return { wallet, total, isUp, bars: buckets.map((b) => b / max) };
    });
  }, [wallets, monthExpenses, expenses, selectedMonth]);

  const handleCardsScroll = () => {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    const card = el.children[0] as HTMLElement;
    const step = card.offsetWidth + 12;
    setActiveCard(Math.min(walletCards.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
  };

  const scrollToCard = (i: number) => {
    const el = scrollRef.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({
      left: card.offsetLeft - (el.offsetWidth - card.offsetWidth) / 2,
      behavior: "smooth",
    });
  };

  // Always the full 8-category list (defaults to 0) — the breakdown rows
  // below need every category visible, not just ones with spend. The
  // segmented bar above them filters to nonzero inline (a 0-width segment
  // isn't meaningful there).
  const categoryTotals = EXPENSE_CATEGORIES.map(({ value }) => ({
    value,
    label: categoryLabel(value, lang),
    color: categoryColor(value),
    Icon: categoryIcon(value),
    total: monthExpenses
      .filter((e) => (e.category ?? "food_snack") === value)
      .reduce((sum, e) => sum + e.amount, 0),
  }));
  const totalSpentThisMonth = categoryTotals.reduce((sum, c) => sum + c.total, 0) || 1;

  const upcoming = upcomingScheduleItems(expenses);
  const { markSeen, isUnread } = useSeenReminders();
  const hasUnread = isUnread(upcoming.map((i) => i.expense.id));
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      {/* Header — profile-avatar slot replaced with SyncMenu (see comment above) */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-[10px] text-ink-faint font-medium">MonthExpense</p>
          <p className="text-xs font-bold text-ink leading-none">{t(lang, "homeTagline")}</p>
          <a
            href="/about"
            className="text-[10px] text-ink-faint hover:text-brand underline underline-offset-2"
          >
            {t(lang, "aboutThisProject")}
          </a>
        </div>

        <div className="flex items-center gap-1.5">
          <SyncMenu
            gateStatus={sync.gateStatus}
            syncing={sync.syncing}
            status={sync.status}
            lastSyncedAt={sync.lastSyncedAt}
            spreadsheetUrl={sync.spreadsheetUrl}
            onRetry={sync.retrySync}
            onRestore={sync.enqueueRestore}
            onDisconnect={sync.disconnect}
            onConnect={onConnect}
            lang={lang}
            online={online}
          />
          <button
            type="button"
            onClick={onOpenWallets}
            title={t(lang, "manageWallets")}
            className="relative h-9 w-9 grid place-items-center rounded-xl border bg-card border-line text-ink-soft hover:text-ink hover:bg-card-hover transition-colors shadow-sm"
          >
            <WalletIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNotifOpen(true);
              markSeen(upcoming.map((i) => i.expense.id));
            }}
            title={t(lang, "reminders")}
            className="relative h-9 w-9 grid place-items-center rounded-xl border bg-card border-line text-ink-soft hover:text-ink hover:bg-card-hover transition-colors shadow-sm"
          >
            <Bell className="w-4 h-4" />
            {hasUnread && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      <NotificationDrawer
        open={notifOpen}
        expenses={expenses}
        onManage={() => {
          setNotifOpen(false);
          onManageRecurring();
        }}
        onClose={() => setNotifOpen(false)}
        lang={lang}
      />

      <ReminderBanner expenses={expenses} onManage={onManageRecurring} lang={lang} />

      {/* Swipeable wallet cards */}
      {walletCards.length > 0 && (
        <div className="relative -mx-4">
          <div
            ref={scrollRef}
            onScroll={handleCardsScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar px-4 pb-1"
          >
            {walletCards.map(({ wallet, total, isUp, bars }, i) => {
              const tone = (i % 3) + 1;
              return (
                <div
                  key={wallet.id}
                  style={{
                    backgroundColor: `var(--color-wallet-${tone})`,
                    color: `var(--color-wallet-${tone}-ink)`,
                  }}
                  className={
                    "relative shrink-0 snap-center overflow-hidden rounded-3xl p-5 shadow-lg shadow-black/5 " +
                    (walletCards.length === 1 ? "w-full" : "w-[82%]")
                  }
                >
                  <div className="absolute -top-14 -right-10 w-40 h-40 rounded-full bg-current opacity-[0.06] pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <AnimalAvatar
                          animal={wallet.animal}
                          className="w-9 h-9"
                          iconClassName="w-4.5 h-4.5"
                        />
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-90 leading-tight">
                          {wallet.name}
                        </p>
                      </div>
                      {/* Expense app — up (more spend than last month) is
                          bad (red), down is good (green), same convention
                          as AnalyticsPage.tsx's real trend. */}
                      {isUp ? (
                        <TrendingUp className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      )}
                    </div>
                    <div className="mt-5 flex items-end justify-between">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wider opacity-60">
                          {t(lang, "thisMonth")}
                        </p>
                        <p className="text-xl font-extrabold font-mono tracking-tight mt-0.5">
                          {formatCurrency(total, currency)}
                        </p>
                      </div>
                      <div className="flex items-end gap-1 h-7">
                        {bars.map((h, bi) => (
                          <div
                            key={bi}
                            className="w-1.5 rounded-full bg-current"
                            style={{
                              height: `${Math.max(h * 100, 10)}%`,
                              opacity: 0.3 + h * 0.7,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {walletCards.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-3">
              {walletCards.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollToCard(i)}
                  className={
                    "h-1.5 rounded-full transition-all duration-300 " +
                    (i === activeCard
                      ? "w-5 bg-brand"
                      : "w-1.5 bg-ink-faint/40 hover:bg-ink-faint/70")
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onScan}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 rounded-2xl border bg-card hover:bg-card-hover border-line text-ink-soft text-xs font-semibold shadow-sm transition-all"
        >
          <span className="flex items-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5 text-brand" />
            {t(lang, "scanReceipt")}
          </span>
          {scanQuota && (
            <span className="text-[9px] font-normal text-ink-faint">
              {t(lang, "quotaRemaining", {
                remaining: scanQuota.remaining,
                limit: scanQuota.limit,
              })}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onVoice}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 rounded-2xl border bg-card hover:bg-card-hover border-line text-ink-soft text-xs font-semibold shadow-sm transition-all"
        >
          <span className="flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
            {t(lang, "voiceInput")}
          </span>
          {voiceQuota && (
            <span className="text-[9px] font-normal text-ink-faint">
              {t(lang, "quotaRemaining", {
                remaining: voiceQuota.remaining,
                limit: voiceQuota.limit,
              })}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onText}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 rounded-2xl border bg-card hover:bg-card-hover border-line text-ink-soft text-xs font-semibold shadow-sm transition-all"
        >
          <span className="flex items-center gap-1.5">
            <ClipboardPaste className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            {t(lang, "textReceiptCardTitle")}
          </span>
          {textQuota && (
            <span className="text-[9px] font-normal text-ink-faint">
              {t(lang, "quotaRemaining", {
                remaining: textQuota.remaining,
                limit: textQuota.limit,
              })}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onManual}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 rounded-2xl border bg-brand/15 hover:bg-brand/20 border-brand/30 text-brand text-xs font-bold shadow-sm transition-all"
        >
          <span className="flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            {t(lang, "addExpense")}
          </span>
          <span className="text-[9px] font-normal text-ink-faint">
            {t(lang, "manualUnlimited")}
          </span>
        </button>
      </div>

      {sync.gateStatus !== "connected" && (
        <div className="space-y-2">
          <WarningCallout>{t(lang, "homeConnectWarningPrefix")}</WarningCallout>
          <Button
            type="button"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={onConnect}
          >
            <GoogleIcon className="w-4 h-4" />
            {t(lang, "connectWithGoogle")}
          </Button>
        </div>
      )}

      {/* Spending summary */}
      <div className="p-4 rounded-3xl border bg-card border-line shadow-sm space-y-3.5 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ChartColumnStacked className="w-4 h-4 text-brand" />
            <h3 className="text-xs font-bold text-ink">{t(lang, "spendingSummary")}</h3>
          </div>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-auto shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full h-2.5 rounded-full overflow-hidden flex gap-1 p-0.5 border bg-elevated border-line-subtle">
          {categoryTotals
            .filter((c) => c.total > 0)
            .map((cat) => (
              <div
                key={cat.value}
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max((cat.total / totalSpentThisMonth) * 100, 3)}%`,
                  backgroundColor: cat.color,
                }}
                title={`${cat.label}: ${formatCurrency(cat.total, currency)}`}
              />
            ))}
        </div>

        <div className="space-y-2.5 pt-1">
          {categoryTotals.map((cat) => (
            <div key={cat.value} className="flex items-center justify-between py-0.5 text-xs">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-5 h-5 rounded-full shrink-0 grid place-items-center"
                  style={{
                    backgroundColor: cat.color + "26",
                    color: cat.color,
                  }}
                >
                  <cat.Icon className="w-3 h-3" />
                </span>
                <span className="text-ink-soft font-medium">{cat.label}</span>
              </div>
              <span className="font-bold text-ink font-mono">
                {formatCurrency(cat.total, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
