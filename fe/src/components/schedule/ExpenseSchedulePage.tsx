import { useMemo, useState } from "react";
import { CheckCircle2, CalendarCheck2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { parseISO } from "date-fns";
import { formatCurrency, localDateKey } from "@/lib/format";
import { t, type Lang } from "@/i18n/translations";
import { MonthCalendar, type DayMark } from "@/components/ui/calendar";
import { categoryColor, categoryIcon } from "@/features/expense/category-visuals";
import type { Expense, ExpenseInput } from "@/features/expense/expense.schema";

type ScheduleTab = "all" | "scheduled" | "debt" | "daily";
const TABS: ScheduleTab[] = ["all", "scheduled", "debt", "daily"];
const TAB_KEY: Record<
  ScheduleTab,
  "scheduleAll" | "scheduleScheduled" | "scheduleDebt" | "scheduleDaily"
> = {
  all: "scheduleAll",
  scheduled: "scheduleScheduled",
  debt: "scheduleDebt",
  daily: "scheduleDaily",
};

// localDateKey (@/lib/format), not toISOString() — that's UTC, which for
// any positive-UTC-offset timezone (e.g. WIB, UTC+7) would report
// *yesterday* as "today" during the first few hours of the local day,
// defaulting focusedDate to a day with no expenses even though the
// calendar's own dots (built the same way, per real e.date values) look
// correct.
const todayKey = localDateKey;
const pad = (n: number) => String(n).padStart(2, "0");

const ScheduleRow = ({
  expense,
  onToggle,
  onOpen,
  lang,
}: {
  expense: Expense;
  onToggle: (patch: Partial<ExpenseInput>) => void;
  onOpen: () => void;
  lang: Lang;
}) => {
  if (expense.scheduleType === "scheduled" || expense.scheduleType === "debt") {
    const done = expense.scheduleType === "scheduled" ? !!expense.paid : !!expense.settled;
    const toggleLabel =
      expense.scheduleType === "scheduled"
        ? t(lang, done ? "markUnpaid" : "markPaid")
        : t(lang, done ? "markUnsettled" : "markSettled");
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
        className={
          "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 cursor-pointer transition-colors " +
          (done
            ? "border-line-subtle bg-elevated/60 opacity-60"
            : "border-line bg-elevated hover:bg-card-hover")
        }
      >
        <div className="min-w-0">
          <p className={"text-xs font-semibold text-ink truncate " + (done ? "line-through" : "")}>
            {expense.title}
          </p>
          <p className="text-[10px] font-mono text-ink-faint">
            {formatCurrency(expense.amount, expense.currency)}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(
              expense.scheduleType === "scheduled"
                ? { paid: !expense.paid }
                : { settled: !expense.settled },
            );
          }}
          className={
            "shrink-0 flex items-center gap-1 py-1.5 px-2.5 rounded-xl text-[10px] font-semibold border transition-colors " +
            (done
              ? "bg-card hover:bg-card-hover text-ink-faint border-line"
              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30")
          }
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> {toggleLabel}
        </button>
      </div>
    );
  }

  const Icon = categoryIcon(expense.category);
  const color = categoryColor(expense.category);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-elevated px-3 py-2.5 text-left transition-colors hover:bg-card-hover"
    >
      <span
        className="w-8 h-8 rounded-xl shrink-0 grid place-items-center"
        style={{ backgroundColor: color + "26", color }}
      >
        {/* eslint-disable-next-line react/static-components -- categoryIcon() returns a stable lookup from CATEGORY_ICON, not a new component */}
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1 text-xs font-semibold text-ink truncate">
        {expense.title}
      </span>
      <span className="shrink-0 text-xs font-bold font-mono text-ink">
        {formatCurrency(expense.amount, expense.currency)}
      </span>
    </button>
  );
};

/**
 * Calendar + 4 tabs (All/Terjadwal/Hutang/Harian) over the real
 * `expenses` list — Terjadwal/Hutang are flagged Expense records
 * (scheduleType/paid/settled), not a separate data model. Creation happens
 * through the FAB's Manual entry flow (see ManualEntryForm.tsx); this page
 * is purely a filtered view + paid/settled toggles.
 */
export const ExpenseSchedulePage = ({
  expenses,
  onUpdateExpense,
  onSelectExpense,
  lang,
}: {
  expenses: Expense[];
  onUpdateExpense: (id: string, patch: Partial<ExpenseInput>) => void;
  onSelectExpense: (expense: Expense) => void;
  lang: Lang;
}) => {
  const [focusedDate, setFocusedDate] = useState(todayKey());
  const [tab, setTab] = useState<ScheduleTab>("all");
  const initialView = parseISO(focusedDate);
  const [viewMonth, setViewMonth] = useState({
    year: initialView.getFullYear(),
    month: initialView.getMonth(),
  });

  // Per-day marks for the calendar's currently displayed month — Harian
  // count drives the numeric badge, Terjadwal/Hutang presence drives the
  // two dots.
  const dayMarks = useMemo(() => {
    const prefix = `${viewMonth.year}-${pad(viewMonth.month + 1)}-`;
    const marks: Record<number, DayMark> = {};
    for (const e of expenses) {
      if (!e.date.startsWith(prefix)) continue;
      const day = Number(e.date.slice(8, 10));
      const mark = marks[day] ?? { normalCount: 0, hasScheduled: false, hasDebt: false };
      if (e.scheduleType === "scheduled") mark.hasScheduled = true;
      else if (e.scheduleType === "debt") mark.hasDebt = true;
      else mark.normalCount++;
      marks[day] = mark;
    }
    return marks;
  }, [expenses, viewMonth]);

  // Harian/Terjadwal/Hutang breakdown for the displayed month.
  const monthTypeCounts = useMemo(() => {
    const prefix = `${viewMonth.year}-${pad(viewMonth.month + 1)}-`;
    let daily = 0;
    let scheduled = 0;
    let debt = 0;
    for (const e of expenses) {
      if (!e.date.startsWith(prefix)) continue;
      if (e.scheduleType === "scheduled") scheduled++;
      else if (e.scheduleType === "debt") debt++;
      else daily++;
    }
    return { daily, scheduled, debt };
  }, [expenses, viewMonth]);

  const dayExpenses = useMemo(
    () => expenses.filter((e) => e.date === focusedDate),
    [expenses, focusedDate],
  );
  const filtered = useMemo(() => {
    if (tab === "all") return dayExpenses;
    if (tab === "daily") return dayExpenses.filter((e) => !e.scheduleType);
    return dayExpenses.filter((e) => e.scheduleType === tab);
  }, [dayExpenses, tab]);
  // Sum of whatever's currently shown for the selected day — tracks the
  // active Harian/Terjadwal/Hutang tab, same list the rows below render.
  const dayTotal = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      <div className="flex items-center justify-between py-1">
        <h2 className="text-lg font-bold text-ink tracking-tight">
          {t(lang, "recurringExpensesTitle")}
        </h2>
      </div>

      <div className="p-4 rounded-3xl border bg-card border-line shadow-sm space-y-2">
        <MonthCalendar
          selected={focusedDate}
          onSelect={setFocusedDate}
          dayMarks={dayMarks}
          onMonthChange={(year, month) => setViewMonth({ year, month })}
          lang={lang}
        />
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-subtle text-[10px]">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span className="text-ink-faint">
                {monthTypeCounts.daily} {t(lang, "scheduleDaily")}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <span className="text-ink-faint">
                {monthTypeCounts.scheduled} {t(lang, "scheduleScheduled")}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-ink-faint">
                {monthTypeCounts.debt} {t(lang, "scheduleDebt")}
              </span>
            </span>
          </div>
          {focusedDate !== todayKey() && (
            <button
              type="button"
              onClick={() => setFocusedDate(todayKey())}
              className="shrink-0 text-brand hover:underline font-semibold"
            >
              {t(lang, "resetFilters")}
            </button>
          )}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-ink-faint">{t(lang, "totalLabel")}</span>
          <span className="text-sm font-bold text-ink tabular-nums">
            {formatCurrency(dayTotal, filtered[0].currency)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl border bg-card border-line shadow-sm">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => setTab(tb)}
            className={
              "flex items-center justify-center px-1 py-1.5 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap " +
              (tab === tb ? "bg-emerald-600 text-white shadow-sm" : "text-ink-faint hover:text-ink")
            }
          >
            {t(lang, TAB_KEY[tb])}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <EmptyState icon={CalendarCheck2} message={t(lang, "emptyScheduleDay")} />
        ) : (
          filtered.map((expense) => (
            <ScheduleRow
              key={expense.id}
              expense={expense}
              onToggle={(patch) => onUpdateExpense(expense.id, patch)}
              onOpen={() => onSelectExpense(expense)}
              lang={lang}
            />
          ))
        )}
      </div>
    </div>
  );
};
