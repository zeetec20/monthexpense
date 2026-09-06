import { useState } from "react";
import {
  Home,
  Wallet,
  Scan,
  ScanLine,
  BarChart3,
  Calendar,
  Mic,
  Plus,
  ClipboardPaste,
} from "lucide-react";
import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { InstallPwaButton } from "@/components/ui/InstallPwaButton";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { t, type Lang } from "@/i18n/translations";
import type { Theme } from "@/hooks/useTheme";

export type AppTab = "home" | "transactions" | "analytics" | "recurring";

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-current={active ? "page" : undefined}
      className={
        "p-2 rounded-2xl flex flex-col items-center transition-all " +
        (active
          ? "text-brand bg-brand/10"
          : "text-ink-faint hover:text-ink-soft")
      }
    >
      {icon}
    </button>
  );
}

/**
 * Literal port of expense-tracker's MobileContainer.tsx — the boxed
 * "phone" shell (edge-to-edge on mobile, centered rounded card on wider
 * screens), 5-slot bottom tab bar with a center scan FAB, and its
 * quick-action bottom sheet. "Reset Mock Data" (their dev-only affordance)
 * is dropped — nothing here has a mock-data concept. Theme + language
 * switchers live here (persistent app-level settings) rather than
 * re-declared per-page the way HomeView.tsx does.
 */
export function AppShell({
  tab,
  onTabChange,
  theme,
  onToggleTheme,
  lang,
  onChangeLang,
  onScan,
  onVoice,
  onText,
  onManual,
  gateStatus,
  onRequireConnect,
  children,
}: {
  tab: AppTab;
  onTabChange: (tab: AppTab) => void;
  theme: Theme;
  onToggleTheme: () => void;
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  onScan: () => void;
  onVoice: () => void;
  onText: () => void;
  onManual: () => void;
  gateStatus: "connected" | "disconnected";
  onRequireConnect: () => void;
  children: ReactNode;
}) {
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  function choose(action: () => void) {
    setQuickActionOpen(false);
    action();
  }

  return (
    <div className="min-h-dvh bg-surface text-ink flex justify-center transition-colors duration-200">
      <div
        id="app-shell-root"
        // h-dvh drives overall shell height. A position:fixed bottom nav
        // was tried here as a workaround for an iOS standalone-PWA
        // cold-launch viewport bug, but it made scrolling feel worse, so
        // it's reverted: nav is back in normal flex flow below.
        className="relative w-full max-w-md lg:max-w-lg flex flex-col h-dvh sm:h-[calc(100dvh-3rem)] sm:my-6 bg-elevated sm:rounded-[2rem] sm:border sm:border-line sm:shadow-2xl overflow-hidden transition-colors duration-200"
      >
        {/* Utility row — theme/language switchers, visible on every screen
            size (mobile had no other way to reach them before). */}
        <div className="flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-line-subtle shrink-0">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="MonthExpense" className="w-6 h-6" />
            <span className="text-sm font-extrabold tracking-tight text-ink">
              MonthExpense
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <InstallPwaButton lang={lang} />
            <ThemeSwitcher theme={theme} onToggle={onToggleTheme} />
            <LanguageSwitcher lang={lang} onChange={onChangeLang} />
          </div>
        </div>

        {/* Scrollable view body */}
        <main className="flex-1 overflow-y-auto no-scrollbar px-4 pt-3 pb-4">
          <div key={tab} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
            {children}
          </div>
        </main>

        {/* Bottom tab bar */}
        <nav className="bg-card/95 backdrop-blur-xl border-t border-line pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-6 shrink-0 transition-colors duration-200">
          <div className="flex items-center justify-between">
            <TabButton
              active={tab === "home"}
              label={t(lang, "navHome")}
              icon={<Home className="w-5 h-5" />}
              onClick={() => onTabChange("home")}
            />
            <TabButton
              active={tab === "transactions"}
              label={t(lang, "navTransactions")}
              icon={<Wallet className="w-5 h-5" />}
              onClick={() => onTabChange("transactions")}
            />
            <button
              type="button"
              onClick={() => (gateStatus === "connected" ? setQuickActionOpen(true) : onRequireConnect())}
              title={t(lang, "addExpense")}
              className="relative -top-3 w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-black/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            >
              <Scan className="w-5 h-5" />
            </button>
            <TabButton
              active={tab === "analytics"}
              label={t(lang, "navAnalytics")}
              icon={<BarChart3 className="w-5 h-5" />}
              onClick={() => onTabChange("analytics")}
            />
            <TabButton
              active={tab === "recurring"}
              label={t(lang, "navRecurring")}
              icon={<Calendar className="w-5 h-5" />}
              onClick={() => onTabChange("recurring")}
            />
          </div>
        </nav>

        {/* Quick-action bottom sheet */}
        <BottomSheet
          open={quickActionOpen}
          onClose={() => setQuickActionOpen(false)}
          title={t(lang, "quickActionsTitle")}
        >
          <>
            <div className="pb-2">
              <h3 className="text-sm font-bold text-ink">
                {t(lang, "quickActionsTitle")}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => choose(onScan)}
                className="p-4 rounded-2xl bg-elevated border border-line hover:border-brand/60 flex flex-col items-center gap-2 group transition-all"
              >
                <div className="w-11 h-11 rounded-2xl bg-brand/10 text-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ScanLine className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-ink text-center">
                  {t(lang, "scanReceiptCard")}
                </span>
                <span className="text-[10px] text-brand">
                  {t(lang, "scanReceiptCardSub")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => choose(onVoice)}
                className="p-4 rounded-2xl bg-elevated border border-line hover:border-sky-500/60 flex flex-col items-center gap-2 group transition-all"
              >
                <div className="w-11 h-11 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Mic className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-ink text-center">
                  {t(lang, "voiceCard")}
                </span>
                <span className="text-[10px] text-sky-600 dark:text-sky-400">
                  {t(lang, "voiceCardSub")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => choose(onText)}
                className="p-4 rounded-2xl bg-elevated border border-line hover:border-amber-500/60 flex flex-col items-center gap-2 group transition-all"
              >
                <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ClipboardPaste className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-ink text-center">
                  {t(lang, "textReceiptCardTitle")}
                </span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  {t(lang, "textReceiptCardSub")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => choose(onManual)}
                className="p-4 rounded-2xl bg-elevated border border-line hover:border-teal-500/60 flex flex-col items-center gap-2 group transition-all"
              >
                <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-ink text-center">
                  {t(lang, "manualCard")}
                </span>
                <span className="text-[10px] text-teal-600 dark:text-teal-400">
                  {t(lang, "manualCardSub")}
                </span>
              </button>
            </div>
          </>
        </BottomSheet>
      </div>
    </div>
  );
}
