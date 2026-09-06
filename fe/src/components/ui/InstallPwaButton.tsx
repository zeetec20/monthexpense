import { useEffect, useState } from "react";
import { Download, MoreVertical, Share, PlusSquare, CheckCircle2, ChevronDown, type LucideIcon } from "lucide-react";
import { usePwaInstall, type InstallVariant } from "@/hooks/usePwaInstall";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { t, type Lang, type TKey } from "@/i18n/translations";

const SEEN_KEY = "expense-notes.pwa-install-seen.v1";

const STEPS: Record<InstallVariant, { icon: LucideIcon; key: TKey }[]> = {
  "android-chrome": [
    { icon: MoreVertical, key: "installAndroidStep1" },
    { icon: Download, key: "installAndroidStep2" },
    { icon: CheckCircle2, key: "installAndroidStep3" },
  ],
  "android-other": [
    { icon: MoreVertical, key: "installAndroidOtherStep1" },
    { icon: Download, key: "installAndroidOtherStep2" },
    { icon: CheckCircle2, key: "installAndroidOtherStep3" },
  ],
  "ios-safari": [
    { icon: Share, key: "installIosSafariStep1" },
    { icon: PlusSquare, key: "installIosSafariStep2" },
    { icon: CheckCircle2, key: "installIosSafariStep3" },
  ],
  "ios-other": [
    { icon: Share, key: "installIosOtherStep1" },
    { icon: PlusSquare, key: "installIosOtherStep2" },
    { icon: CheckCircle2, key: "installIosOtherStep3" },
  ],
};

/**
 * Mobile-only install affordance — Android/Chrome triggers the native
 * beforeinstallprompt flow directly; every other combo (iOS Safari, iOS
 * Chrome, or Android without the event) opens a step-by-step instructions
 * sheet instead (see usePwaInstall.ts). Auto-opens once on the user's
 * first visit (welcoming copy), otherwise opens on tap (direct copy).
 * Renders nothing on desktop, unsupported browsers, or once installed.
 */
export function InstallPwaButton({ lang }: { lang: Lang }) {
  const { variant, canPromptNatively, promptInstall } = usePwaInstall();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual">("manual");

  useEffect(() => {
    if (!variant || canPromptNatively) return;
    if (localStorage.getItem(SEEN_KEY)) return;
    const timer = setTimeout(() => {
      localStorage.setItem(SEEN_KEY, "1");
      setMode("auto");
      setSheetOpen(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [variant, canPromptNatively]);

  if (!variant) return null;

  function openManually() {
    if (canPromptNatively) {
      void promptInstall();
      return;
    }
    setMode("manual");
    setSheetOpen(true);
  }

  const steps = STEPS[variant];

  return (
    <>
      <button
        type="button"
        onClick={openManually}
        title={t(lang, "installApp")}
        aria-label={t(lang, "installApp")}
        className="h-9 px-3 max-[380px]:px-2 gap-1.5 max-[380px]:gap-0 flex items-center rounded-xl border bg-card border-line text-ink-soft hover:text-ink hover:bg-card-hover shadow-sm transition-all duration-200 shrink-0"
      >
        <Download className="w-4 h-4" />
        <span className="text-xs font-bold max-[380px]:hidden">{t(lang, "installApp")}</span>
      </button>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t(lang, "installInstructionsTitle")}>
        <h3 className="text-sm font-bold text-ink pb-1">
          {t(lang, mode === "auto" ? "installWelcomeTitle" : "installInstructionsTitle")}
        </h3>
        {mode === "auto" && <p className="text-sm text-ink-soft pb-3">{t(lang, "installWelcomeBody")}</p>}
        <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft pb-3">
          <li>{t(lang, "installBenefitOffline")}</li>
          <li>{t(lang, "installBenefitPersistent")}</li>
          <li>{t(lang, "installBenefitFast")}</li>
        </ul>

        {canPromptNatively ? (
          <p className="text-sm text-ink-soft">{t(lang, "installAndroidTapButton")}</p>
        ) : (
          <div className="flex flex-col">
            {steps.map(({ icon: Icon, key }, i) => (
              <div key={key} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 shrink-0 grid place-items-center rounded-full bg-brand/10 text-brand text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className="w-9 h-9 shrink-0 grid place-items-center rounded-xl bg-elevated border border-line text-ink-soft">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm text-ink-soft">{t(lang, key)}</p>
                </div>
                {i < steps.length - 1 && <ChevronDown className="w-4 h-4 ml-3 my-1 text-ink-faint" />}
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
