import { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Receipt,
  Check,
  CloudOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { categoryColor, categoryIcon, categoryLabel } from "@/features/expense/category-visuals";
import { t, type Lang } from "@/i18n/translations";
import {
  EXPENSE_CATEGORIES,
  sortExpensesByNewestCreated,
  type Expense,
} from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

/**
 * Literal-treatment port of expense-tracker's TransactionsView.tsx —
 * search + filter pills + CSV export + list, adapted to this app's real
 * fields (Wallet/Category/Month) rather than the prototype's own
 * payment-method/status filters, which don't apply to this data model.
 * Tapping a row still opens the existing, fully-featured
 * ExpenseDetailModal (image/items/wallet/category editing) instead of a
 * rebuilt bottom-sheet clone — that modal already does more than the
 * prototype's detail sheet.
 */
export const TransactionsPage = ({
  expenses,
  wallets,
  onSelect,
  lang,
  onRetrySync,
  onSyncExpense,
  syncing = false,
}: {
  expenses: Expense[];
  wallets: Wallet[];
  onSelect: (expense: Expense) => void;
  lang: Lang;
  onRetrySync?: () => void;
  onSyncExpense?: (expense: Expense) => void;
  syncing?: boolean;
}) => {
  const [search, setSearch] = useState("");
  const [walletFilter, setWalletFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [monthFilter, setMonthFilter] = useState(ALL);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilterCount = [walletFilter, categoryFilter, monthFilter].filter(
    (f) => f !== ALL,
  ).length;

  const unsyncedCount = useMemo(
    () => expenses.filter((e) => e.synced === false).length,
    [expenses],
  );
  const walletName = (id: string | undefined) => wallets.find((w) => w.id === id)?.name ?? "";
  const months = useMemo(
    () => [...new Set(expenses.map((e) => e.date.slice(0, 7)))].sort().reverse(),
    [expenses],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const matched = expenses.filter((e) => {
      const matchSearch = !q || e.title.toLowerCase().includes(q) || String(e.amount).includes(q);
      const matchWallet = walletFilter === ALL || e.walletId === walletFilter;
      const matchCategory = categoryFilter === ALL || (e.category ?? "other") === categoryFilter;
      const matchMonth = monthFilter === ALL || e.date.startsWith(monthFilter);
      return matchSearch && matchWallet && matchCategory && matchMonth;
    });
    return sortExpensesByNewestCreated(matched);
  }, [expenses, search, walletFilter, categoryFilter, monthFilter]);

  return (
    <div className="space-y-3.5 max-w-sm mx-auto">
      <div className="flex items-center justify-between py-1">
        <h2 className="text-lg font-bold text-ink tracking-tight">
          {t(lang, "transactionsTitle")}
        </h2>
      </div>
      {unsyncedCount > 0 && onRetrySync && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <CloudOff className="w-4 h-4 shrink-0 text-amber-500" />
            <span className="font-medium truncate">
              {t(lang, "unsyncedCount").replace("{count}", String(unsyncedCount))}
            </span>
          </div>
          <button
            type="button"
            onClick={onRetrySync}
            disabled={syncing}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {t(lang, "trySync")}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-2xl border bg-card text-ink-soft border-line hover:border-ink-faint/40 hover:bg-card-hover text-xs font-semibold shadow-sm transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        {t(lang, "filter")}
        {activeFilterCount > 0 && (
          <span className="ml-0.5 grid place-items-center w-4 h-4 rounded-full bg-brand text-[9px] font-bold text-brand-ink">
            {activeFilterCount}
          </span>
        )}
      </button>

      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t(lang, "filter")}>
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-sm font-bold text-ink">{t(lang, "filter")}</h3>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setWalletFilter(ALL);
                setCategoryFilter(ALL);
                setMonthFilter(ALL);
              }}
              className="text-[11px] font-semibold text-brand hover:underline"
            >
              {t(lang, "resetFilters")}
            </button>
          )}
        </div>

        <div className="space-y-3">
          <Select value={walletFilter} onValueChange={setWalletFilter}>
            <SelectTrigger className="text-xs py-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(lang, "allWallets")}</SelectItem>
              {wallets.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="text-xs py-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(lang, "allCategories")}</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {categoryLabel(c.value, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="text-xs py-2.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t(lang, "allMonths")}</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          type="button"
          onClick={() => setFilterOpen(false)}
          className="w-full flex items-center justify-center py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-black/10 transition-all"
        >
          {t(lang, "applyFilters")}
        </button>
      </BottomSheet>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
        <input
          type="text"
          placeholder={t(lang, "searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border bg-card border-line text-ink placeholder:text-ink-faint rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-brand font-medium shadow-sm transition-colors"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Receipt} message={t(lang, "noTransactionsFound")} />
      ) : (
        <div className="divide-y divide-line-subtle rounded-2xl border bg-card border-line shadow-sm transition-colors">
          {filtered.map((expense) => {
            const Icon = categoryIcon(expense.category);
            const color = categoryColor(expense.category);
            const isSynced = expense.synced !== false;
            return (
              <div
                key={expense.id}
                onClick={() => onSelect(expense)}
                className="flex items-center justify-between py-2.5 px-3 transition-colors cursor-pointer hover:bg-card-hover"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <span
                    className="w-8 h-8 rounded-xl shrink-0 grid place-items-center"
                    style={{ backgroundColor: color + "26", color }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{expense.title}</p>
                    <p className="text-[10px] text-ink-faint flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                          isSynced
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isSynced ? (
                          <Check className="w-2.5 h-2.5" />
                        ) : (
                          <CloudOff className="w-2.5 h-2.5" />
                        )}
                        {t(lang, isSynced ? "synced" : "notSynced")}
                      </span>
                      <span>·</span>
                      <span>{formatDate(expense.date)}</span>
                      {walletName(expense.walletId) ? (
                        <span>· {walletName(expense.walletId)}</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <p className="text-xs font-bold font-mono text-ink">
                    {formatCurrency(expense.amount, expense.currency)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {!isSynced && onSyncExpense && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSyncExpense(expense);
                        }}
                        disabled={syncing}
                        className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
                      >
                        {syncing ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-2.5 h-2.5" />
                        )}
                        {t(lang, "trySync")}
                      </button>
                    )}
                    <span className="inline-block text-[9px] font-medium px-2 py-0.5 rounded-full border bg-elevated text-ink-faint border-line-subtle">
                      {categoryLabel(expense.category, lang)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
