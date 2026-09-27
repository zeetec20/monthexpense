import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { MonthCalendar } from "./calendar";
import { useShellPortalContainer } from "./bottom-sheet";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lang } from "@/i18n/translations";

/** Popover-based date picker (radix-ui's Popover — same umbrella package
 * as Dialog/Select) replacing every `<input type="date">`, so date
 * entry always goes through the same MonthCalendar grid instead of the
 * native OS/browser date widget. */
export function DatePicker({
  id,
  value,
  onChange,
  minDate,
  disabledDates,
  lang = "id",
  className,
}: {
  id?: string;
  value: string;
  onChange: (date: string) => void;
  /** See MonthCalendar — disables dates before this. */
  minDate?: string;
  /** See MonthCalendar — disables these specific dates. */
  disabledDates?: string[];
  lang?: Lang;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useShellPortalContainer();

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 opacity-60" />
          {formatDate(value)}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-2xl border bg-card border-line p-3 shadow-xl shadow-black/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <MonthCalendar
            selected={value || null}
            onSelect={(date) => {
              onChange(date);
              setOpen(false);
            }}
            minDate={minDate}
            disabledDates={disabledDates}
            lang={lang}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
