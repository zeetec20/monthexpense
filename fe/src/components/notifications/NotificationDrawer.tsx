import { Bell } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { upcomingScheduleItems } from "@/features/expense/schedule";
import { t, type Lang } from "@/i18n/translations";
import type { Expense } from "@/features/expense/expense.schema";

const dueLabel = (daysUntil: number, lang: Lang) => {
  if (daysUntil < 0) return t(lang, "overdueByDays", { days: -daysUntil });
  if (daysUntil === 0) return t(lang, "dueToday");
  if (daysUntil === 1) return t(lang, "dueTomorrow");
  return t(lang, "dueInDays", { days: daysUntil });
};

/**
 * Real notification view for the bell icon — every unpaid scheduled
 * bill / unsettled debt (see schedule.ts), soonest-or-most-overdue
 * first, sourced from real Expense records. Read-only except the
 * explicit Manage button at the bottom, which switches to the full
 * schedule page.
 */
export const NotificationDrawer = ({
  open,
  expenses,
  onManage,
  onClose,
  lang,
}: {
  open: boolean;
  expenses: Expense[];
  onManage: () => void;
  onClose: () => void;
  lang: Lang;
}) => {
  const items = upcomingScheduleItems(expenses);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t(lang, "reminders")}
      className="max-h-[85vh] flex flex-col"
    >
      <>
        <h3 className="shrink-0 text-sm font-bold text-ink">{t(lang, "reminders")}</h3>

        <div className="flex-1 overflow-y-auto space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Bell className="w-6 h-6 text-ink-faint" />
              <p className="text-xs text-ink-faint">{t(lang, "emptyScheduleDay")}</p>
            </div>
          ) : (
            items.map(({ expense, daysUntil }) => {
              const urgent = daysUntil <= 1;
              return (
                <div
                  key={expense.id}
                  className={
                    "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 " +
                    (urgent ? "border-red-500/30 bg-red-500/10" : "border-line bg-elevated")
                  }
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{expense.title}</p>
                    <p className={"text-[10px] " + (urgent ? "text-red-500" : "text-ink-faint")}>
                      {dueLabel(daysUntil, lang)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold font-mono text-ink">
                    {formatCurrency(expense.amount, expense.currency)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={onManage}
          className="shrink-0 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-black/10 transition-all"
        >
          {t(lang, "manage")}
        </button>
      </>
    </BottomSheet>
  );
};
