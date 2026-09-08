import { useState, type ChangeEvent, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface NumberInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "type"
> {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Allow a fractional part (e.g. quantity "1.5 kg") instead of the
   * default integer/thousands-grouped money-field behavior. Money
   * fields (unit price, tax, etc.) must stay integer-only — IDR has no
   * fractional subunit — so this is opt-in, not a global switch. */
  decimal?: boolean;
}

/** Plain text input (not type="number") formatted with Indonesian
 * dot-thousands separators as you type — kills the native increment/
 * decrement spinner by construction, no spinner-hiding CSS needed. */
export function NumberInput({ value, onChange, className, decimal, ...props }: NumberInputProps) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));
  // Stay in sync when the value changes from outside (form reset, etc) —
  // derived during render (React's "adjusting state when a prop changes"
  // pattern) instead of an effect, so there's no extra render round-trip.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setRaw(value == null ? "" : String(value));
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (decimal) {
      // Keep digits and a single "." (collapse any 2nd+ dot) — lets
      // "1.5" through but not "1.5.2". No thousands grouping here: it
      // would fight an in-progress decimal ("1." mid-type) and
      // quantities are small enough not to need it.
      const digitsAndDot = e.target.value.replace(/[^\d.]/g, "");
      const parts = digitsAndDot.split(".");
      const normalized = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : digitsAndDot;
      setRaw(normalized);
      onChange(normalized === "" || normalized === "." ? null : parseFloat(normalized));
      return;
    }
    const digits = e.target.value.replace(/\D/g, "");
    setRaw(digits);
    onChange(digits === "" ? null : Number(digits));
  }

  return (
    <input
      {...props}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={decimal ? raw : raw === "" ? "" : Number(raw).toLocaleString("id-ID")}
      onChange={handleChange}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
    />
  );
}
