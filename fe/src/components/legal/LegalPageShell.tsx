import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared layout for /privacy and /terms — deliberately NOT the app's boxed
 * "phone shell" (AppShell.tsx's max-w-md rounded card) since these are
 * plain, full-width standalone pages (Google's OAuth verification just
 * needs a working public link, not a mobile-app-style view), reusing the
 * app's color tokens/fonts so it still reads as the same product.
 */
export function LegalPageShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto max-w-2xl px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
        <a href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Back to MonthExpense
        </a>
        <h1 className="mb-1 text-2xl font-bold">{title}</h1>
        {updated && <p className="mb-8 text-xs text-ink-faint">Last updated: {updated}</p>}
        <div className="space-y-6 text-sm leading-relaxed text-ink-soft [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      </div>
    </div>
  );
}
