import { Sun, Moon } from "lucide-react";
import type { Theme } from "@/hooks/useTheme";

/** Ported near-verbatim from expense-tracker's ThemeSwitcher.tsx. */
export function ThemeSwitcher({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "h-9 w-9 grid place-items-center rounded-xl border transition-all duration-200 shrink-0 " +
        (theme === "light"
          ? "bg-white border-slate-200 text-amber-500 hover:bg-slate-50 shadow-sm"
          : "bg-card border-line text-yellow-400 hover:bg-card-hover hover:text-yellow-300 shadow-sm")
      }
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Sun className="w-4 h-4 transition-transform hover:rotate-45 duration-300" />
      ) : (
        <Moon className="w-4 h-4 transition-transform hover:-rotate-12 duration-300" />
      )}
    </button>
  );
}
