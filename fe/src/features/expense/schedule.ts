import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Expense } from "./expense.schema";
import { localDateKey } from "@/lib/format";

/** The one place "excluded from spend totals" logic lives — a settled
 * Hutang (debt someone paid back) doesn't count as real spend anymore,
 * but the record stays visible everywhere else (Transactions, the
 * schedule page). A Tagihan Terjadwal (scheduled bill) always counts,
 * paid or not — it's real money spent regardless of when it was paid. */
export const isCountedExpense = (expense: Expense): boolean => {
  return !(expense.scheduleType === "debt" && expense.settled);
};

export interface UpcomingScheduleItem {
  expense: Expense;
  /** Negative = overdue by that many days, 0 = due today, positive =
   * due in that many days. Unlike the old dueDay-only model, this has
   * real paid-state to compare against, so "overdue" is meaningful now. */
  daysUntil: number;
}

// parseISO (not new Date(str)) — a bare "YYYY-MM-DD" string parses as
// *local* midnight via parseISO, unlike new Date(str) which is UTC.
const daysBetween = (fromKey: string, toKey: string): number => {
  return differenceInCalendarDays(parseISO(toKey), parseISO(fromKey));
};

/** Every unpaid scheduled bill / unsettled debt, soonest (or most
 * overdue) first. Powers ReminderBanner (soonest one) and
 * NotificationDrawer (the full list). */
export const upcomingScheduleItems = (
  expenses: Expense[],
  today: Date = new Date(),
): UpcomingScheduleItem[] => {
  const todayKey = localDateKey(today);
  return expenses
    .filter(
      (e) =>
        (e.scheduleType === "scheduled" && !e.paid) || (e.scheduleType === "debt" && !e.settled),
    )
    .map((expense) => ({ expense, daysUntil: daysBetween(todayKey, expense.date) }))
    .sort((a, b) => a.daysUntil - b.daysUntil);
};
