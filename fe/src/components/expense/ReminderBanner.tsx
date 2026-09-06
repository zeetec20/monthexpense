import { useState } from "react";
import { Bell, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { upcomingScheduleItems } from "@/features/expense/schedule";
import { t, type Lang } from "@/i18n/translations";
import type { Expense } from "@/features/expense/expense.schema";

const DUE_SOON_DAYS = 3;

function dueLabel(daysUntil: number, lang: Lang) {
  if (daysUntil < 0) return t(lang, "overdueByDays", { days: -daysUntil });
  if (daysUntil === 0) return t(lang, "dueToday");
  if (daysUntil === 1) return t(lang, "dueTomorrow");
  return t(lang, "dueInDays", { days: daysUntil });
}

/**
 * In-page "next expense" reminder — like Google Meet's "meeting starting
 * soon" banner: shown inline on the page, not a device/OS notification.
 * Sourced from real Expense records flagged scheduled/debt (see
 * schedule.ts) — not a separate recurring-item model. Dismiss is
 * session-only (plain useState, nothing persisted) so it naturally
 * reappears next time the app opens while still due.
 */
export function ReminderBanner({ expenses, onManage, lang }: { expenses: Expense[]; onManage: () => void; lang: Lang }) {
  const [dismissed, setDismissed] = useState(false);
  const next = upcomingScheduleItems(expenses)[0];

  if (dismissed || !next || next.daysUntil > DUE_SOON_DAYS) return null;
  const urgent = next.daysUntil <= 1;

  return (
    <div
      className={
        "flex items-center gap-3 rounded-2xl border px-4 py-3 " +
        (urgent ? "border-red-500/30 bg-red-500/10" : "border-line bg-card")
      }
    >
      <Bell className={"size-4 shrink-0 " + (urgent ? "text-red-500" : "text-ink-soft")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {next.expense.title} · {formatCurrency(next.expense.amount, next.expense.currency)}
        </p>
        <p className={"text-xs " + (urgent ? "text-red-500" : "text-ink-faint")}>{dueLabel(next.daysUntil, lang)}</p>
      </div>
      <button type="button" onClick={onManage} className="shrink-0 text-xs text-ink-soft underline-offset-4 hover:underline">
        {t(lang, "manage")}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss reminder"
        className="shrink-0 p-1 rounded-full text-ink-faint hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
