import type { LucideIcon } from "lucide-react";

/** Illustrated empty state — icon in a soft rounded badge with a gentle
 * float animation, replacing a plain line of text. */
export function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="w-16 h-16 rounded-3xl bg-brand/10 text-brand flex items-center justify-center animate-float">
        <Icon className="w-7 h-7" />
      </div>
      <p className="text-xs text-ink-faint max-w-[220px]">{message}</p>
    </div>
  );
}
