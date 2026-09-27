import { useMemo, useState } from "react";
import {
  differenceInCalendarDays,
  getDaysInMonth,
  parseISO,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import { TrendingDown, TrendingUp, Calendar, Tag, Flame } from "lucide-react";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, localMonthKey } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isCountedExpense } from "@/features/expense/schedule";
import { categoryColor, categoryLabel } from "@/features/expense/category-visuals";
import { t, type Lang } from "@/i18n/translations";
import { EXPENSE_CATEGORIES, type Expense } from "@/features/expense/expense.schema";

type Period = "thisMonth" | "last3m" | "last6m" | "thisYear";

/** Same 5-day-bucket idea already proven in the Google Sheets "Tren
 * Pengeluaran" formula (see google-provision.client.ts's
 * buildSpreadsheetStructure_) — ported client-side for the in-app chart
 * instead of a recharts-specific fixture. */
const bucketByFiveDays = (expenses: Expense[], today: Date) => {
  const lastDay = getDaysInMonth(today);
  const buckets = new Map<string, number>();
  for (const e of expenses) {
    // parseISO (not a naive split("-")[2]) — a pulled-from-Sheets expense's
    // date can carry a full "YYYY-MM-DDTHH:mm:ss" timestamp, and splitting
    // that on "-" grabs "DDTHH:mm:ss" instead of the day, producing NaN →
    // "NaN-NaN" labels. parseISO handles both the plain-date and
    // full-timestamp shape.
    const day = parseISO(e.date).getDate();
    const start = Math.floor((day - 1) / 5) * 5 + 1;
    const end = Math.min(start + 4, lastDay);
    const label = `${start}-${end}`;
    buckets.set(label, (buckets.get(label) ?? 0) + e.amount);
  }
  return [...buckets.entries()]
    .sort((a, b) => Number(a[0].split("-")[0]) - Number(b[0].split("-")[0]))
    .map(([name, spending]) => ({ name, spending }));
};

const bucketByMonth = (expenses: Expense[], lang: Lang) => {
  const sums = new Map<string, number>();
  for (const e of expenses) {
    const key = e.date.slice(0, 7);
    sums.set(key, (sums.get(key) ?? 0) + e.amount);
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, spending]) => ({
      name: new Date(`${key}-01`).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
        month: "short",
      }),
      spending,
    }));
};

// isCountedExpense: a settled Hutang doesn't count as real spend anymore.
const periodExpenses = (expenses: Expense[], period: Period, today: Date) => {
  const counted = expenses.filter(isCountedExpense);
  if (period === "thisMonth") return counted.filter((e) => e.date.startsWith(localMonthKey(today)));
  if (period === "thisYear")
    return counted.filter((e) => e.date.startsWith(String(today.getFullYear())));
  const months = period === "last3m" ? 3 : 6;
  const cutoff = subMonths(startOfMonth(today), months - 1);
  // parseISO (not new Date(str)) — a bare "YYYY-MM-DD" string parses as
  // local midnight via parseISO, unlike new Date(str), which is UTC.
  return counted.filter((e) => parseISO(e.date) >= cutoff);
};

// Same-length window immediately before periodExpenses' — previous
// calendar month for "thisMonth", previous calendar year for "thisYear",
// the equal-length window right before the current one otherwise.
const previousPeriodExpenses = (expenses: Expense[], period: Period, today: Date) => {
  const counted = expenses.filter(isCountedExpense);
  if (period === "thisMonth") {
    const prevMonth = localMonthKey(subMonths(today, 1));
    return counted.filter((e) => e.date.startsWith(prevMonth));
  }
  if (period === "thisYear") {
    const prevYear = String(today.getFullYear() - 1);
    return counted.filter((e) => e.date.startsWith(prevYear));
  }
  const months = period === "last3m" ? 3 : 6;
  const currentStart = subMonths(startOfMonth(today), months - 1);
  const previousStart = subMonths(currentStart, months);
  return counted.filter((e) => {
    const d = parseISO(e.date);
    return d >= previousStart && d < currentStart;
  });
};

const periodDays = (period: Period, today: Date) => {
  if (period === "thisMonth") return getDaysInMonth(today);
  if (period === "thisYear") return differenceInCalendarDays(today, startOfYear(today)) + 1;
  return (period === "last3m" ? 3 : 6) * 30;
};

/**
 * Literal-treatment port of expense-tracker's AnalyticsView.tsx — real
 * `expenses` instead of the prototype's hardcoded fixture objects. Google
 * Sheets still owns the all-history dashboard (its own Stats tab, see
 * google-provision.client.ts); this is the in-app monthly/period view.
 */
export const AnalyticsPage = ({ expenses, lang }: { expenses: Expense[]; lang: Lang }) => {
  const [period, setPeriod] = useState<Period>("thisMonth");
  const today = useMemo(() => new Date(), []);
  const currency = expenses[0]?.currency ?? "IDR";

  const inPeriod = useMemo(
    () => periodExpenses(expenses, period, today),
    [expenses, period, today],
  );
  const trendData = useMemo(
    () =>
      period === "thisMonth" ? bucketByFiveDays(inPeriod, today) : bucketByMonth(inPeriod, lang),
    [inPeriod, period, today, lang],
  );
  const categoryData = useMemo(
    () =>
      EXPENSE_CATEGORIES.map((c) => ({
        name: categoryLabel(c.value, lang),
        value: inPeriod
          .filter((e) => (e.category ?? "other") === c.value)
          .reduce((sum, e) => sum + e.amount, 0),
        color: categoryColor(c.value),
      })).sort((a, b) => b.value - a.value),
    // Always the full 8-category list (defaults to 0) — the legend below
    // needs every category visible, not just ones with spend.
    [inPeriod, lang],
  );
  // The donut itself only wants nonzero slices — an all-zero/mostly-zero
  // pie isn't useful to render, the legend is what needs every category.
  const pieData = useMemo(() => categoryData.filter((c) => c.value > 0), [categoryData]);

  const totalSpent = inPeriod.reduce((sum, e) => sum + e.amount, 0);
  const previousTotal = useMemo(
    () => previousPeriodExpenses(expenses, period, today).reduce((sum, e) => sum + e.amount, 0),
    [expenses, period, today],
  );
  // No prior-period data to compare against defaults to "up" — spending
  // against zero prior spend is definitionally an increase, and this is
  // also the explicit product call for that edge case.
  const spendingUp = previousTotal === 0 ? true : totalSpent > previousTotal;
  const dailyAverage = Math.round(totalSpent / periodDays(period, today));
  const topCategory = totalSpent > 0 ? (categoryData[0]?.name ?? "–") : "–";
  const peak =
    trendData.length > 0 ? trendData.reduce((a, b) => (b.spending > a.spending ? b : a)) : null;

  return (
    <div className="space-y-3.5 max-w-sm mx-auto">
      <div className="flex items-center justify-between py-1">
        <h2 className="text-lg font-bold text-ink tracking-tight">{t(lang, "analyticsTitle")}</h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-auto shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="thisMonth">{t(lang, "thisMonth")}</SelectItem>
            <SelectItem value="last3m">{t(lang, "rangeLast3Months")}</SelectItem>
            <SelectItem value="last6m">{t(lang, "rangeLast6Months")}</SelectItem>
            <SelectItem value="thisYear">{t(lang, "thisYear")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3.5 rounded-2xl bg-card border border-line transition-colors duration-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-ink-faint">
              {t(lang, "totalSpending")}
            </span>
            {/* Expense app, not a stock ticker — spending up is bad (red),
                down is good (green), the reverse of the generic convention. */}
            {spendingUp ? (
              <TrendingUp className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            )}
          </div>
          <p className="text-base font-extrabold text-ink font-mono">
            {formatCurrency(totalSpent, currency)}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-line transition-colors duration-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-ink-faint">
              {t(lang, "dailyAverage")}
            </span>
            <Calendar className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <p className="text-base font-extrabold text-ink font-mono">
            {formatCurrency(dailyAverage, currency)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-2xl bg-card border border-line flex items-center gap-2.5 transition-colors duration-200">
          <div className="w-7 h-7 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand shrink-0">
            <Tag className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-ink-faint">{t(lang, "topSpendingCategory")}</p>
            <p className="text-[11px] font-bold text-ink truncate">{topCategory}</p>
          </div>
        </div>
        <div className="p-2.5 rounded-2xl bg-card border border-line flex items-center gap-2.5 transition-colors duration-200">
          <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
            <Flame className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-ink-faint">{t(lang, "peakSpending")}</p>
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 font-mono">
              {peak?.name ?? "–"}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-card border border-line space-y-2 shadow-lg transition-colors duration-200">
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
          {t(lang, "spendingTrend")}
        </h3>
        {trendData.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-faint">{t(lang, "noDataYet")}</p>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="emeraldG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7FA873" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#7FA873" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-rule)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-ink-3)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-ink-3)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    v >= 1000000
                      ? `${(v / 1000000).toFixed(1)}jt`
                      : v >= 1000
                        ? `${Math.round(v / 1000)}k`
                        : `${v}`
                  }
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value) || 0, currency)}
                  contentStyle={{
                    backgroundColor: "var(--color-paper-2)",
                    borderColor: "var(--color-rule)",
                    borderRadius: "10px",
                    fontSize: "10px",
                    color: "var(--color-ink)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="spending"
                  stroke="#7FA873"
                  strokeWidth={2.5}
                  fill="url(#emeraldG)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="p-4 rounded-3xl bg-card border border-line space-y-2 shadow-lg transition-colors duration-200">
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
          {t(lang, "categoryBreakdown")}
        </h3>
        {totalSpent === 0 ? (
          <p className="py-8 text-center text-xs text-ink-faint">{t(lang, "noDataYet")}</p>
        ) : (
          <div className="h-44 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.color}
                      stroke="var(--color-paper)"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value) || 0, currency)}
                  contentStyle={{
                    backgroundColor: "var(--color-paper-2)",
                    borderColor: "var(--color-rule)",
                    borderRadius: "10px",
                    fontSize: "10px",
                    color: "var(--color-ink)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Legend always shows the full 8-category list, defaulting
            untouched categories to 0 — independent of whether the donut
            above rendered (it's hidden entirely at zero total spend). */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 text-xs">
          {categoryData.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between p-1 rounded-lg bg-elevated/60"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-ink-soft text-[10px] truncate max-w-[80px]">{c.name}</span>
              </div>
              <span className="font-mono text-ink-faint text-[10px]">
                {formatCurrency(c.value, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
