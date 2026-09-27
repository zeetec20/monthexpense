import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** Amber "read this" box — for instructions that matter (a required
 * one-time step, a platform dependency), not for actual errors (those
 * stay red, see ConnectGate's `phase === "error"` branch). */
export function WarningCallout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
