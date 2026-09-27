import { useEffect, useState } from "react";
import { addMonths, getDaysInMonth, parseISO, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { localDateKey } from "@/lib/format";
import type { Lang } from "@/i18n/translations";

const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = localDateKey;

export interface DayMark {
  /** Normal (Harian) item count — drives the numeric badge. */
  normalCount: number;
  /** Any Terjadwal (scheduled) item that day — drives the sky dot. */
  hasScheduled: boolean;
  /** Any Hutang (debt) item that day — drives the rose dot. */
  hasDebt: boolean;
}

export interface MonthCalendarProps {
  /** Selected date, "YYYY-MM-DD", or null. */
  selected: string | null;
  onSelect: (date: string) => void;
  /** Per-day marks for the *displayed* month, keyed by day-of-month —
   * drives the numeric badge (Harian count) and the Terjadwal/Hutang
   * dots. Omit for a bare calendar (the date-picker popover). */
  dayMarks?: Record<number, DayMark>;
  /** Fired on mount and whenever prev/next month navigation changes the
   * displayed month — lets a caller (e.g. ExpenseSchedulePage) recompute
   * `dayMarks` for whichever month is currently shown. */
  onMonthChange?: (year: number, month: number) => void;
  /** Dates before this ("YYYY-MM-DD") are disabled — unclickable, muted. */
  minDate?: string;
  /** Specific dates disabled regardless of `minDate` (e.g. a sibling
   * Terjadwal row's already-picked date) — doesn't include `selected`
   * itself even if present, that day should stay visibly selected. */
  disabledDates?: string[];
  lang: Lang;
  className?: string;
}

/**
 * Month grid with prev/next navigation and background-filled day cells —
 * reused by both ExpenseSchedulePage (with dayMarks badges/dots) and
 * DatePicker (bare, single-selection). View month defaults to the
 * selected date's month, independent of `selected` afterwards so
 * navigating doesn't get overridden by the parent's state.
 */
export function MonthCalendar({
  selected,
  onSelect,
  dayMarks,
  onMonthChange,
  minDate,
  disabledDates,
  lang,
  className,
}: MonthCalendarProps) {
  const initial = selected ? parseISO(selected) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    onMonthChange?.(viewYear, viewMonth);
    // Only re-fire when the displayed month actually changes — onMonthChange
    // isn't guaranteed to be a stable reference across parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const base = new Date(viewYear, viewMonth, 1);
    const d = delta >= 0 ? addMonths(base, delta) : subMonths(base, -delta);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = getDaysInMonth(new Date(viewYear, viewMonth, 1));
  const locale = lang === "id" ? "id-ID" : "en-US";
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: "narrow" }),
  );
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const dateKey = (day: number) => `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  const today = todayKey();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-card-hover transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-xs font-bold text-ink capitalize">{monthLabel}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-card-hover transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayLabels.map((w, i) => (
          <span key={i} className="text-[9px] font-semibold text-ink-faint">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="aspect-square" />;
          const key = dateKey(day);
          const isToday = key === today;
          const isSelected = key === selected;
          const mark = dayMarks?.[day];
          const isDisabled =
            (minDate !== undefined && key < minDate) || (disabledDates?.includes(key) ?? false);
          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(key)}
              className={
                "relative aspect-square flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors " +
                (isDisabled
                  ? "bg-elevated text-ink-faint/50 cursor-not-allowed"
                  : isToday
                    ? "bg-brand/15 text-brand font-bold"
                    : "bg-elevated text-ink-soft hover:bg-card-hover") +
                (isSelected ? " ring-[1.5px] ring-brand ring-offset-1 ring-offset-card" : "")
              }
            >
              <span className={"text-[10px] " + (isSelected ? "font-bold" : "")}>{day}</span>
              {(mark?.hasScheduled || mark?.hasDebt) && (
                <span className="flex items-center gap-0.5">
                  {mark?.hasScheduled && <span className="w-1 h-1 rounded-full bg-sky-500" />}
                  {mark?.hasDebt && <span className="w-1 h-1 rounded-full bg-rose-500" />}
                </span>
              )}
              {!!mark?.normalCount && (
                <span className="absolute top-[3px] right-[3px] text-[7px] font-bold text-white bg-emerald-600 px-1 py-0.5 rounded-full leading-tight">
                  {mark.normalCount > 9 ? "9+" : mark.normalCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
