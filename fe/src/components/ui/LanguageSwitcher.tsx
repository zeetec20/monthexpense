import type { Lang } from "@/i18n/translations";

/** Ported from expense-tracker's LanguageSwitcher.tsx — ID listed first,
 * matching this app's id-by-default priority (see useLanguage.ts). */
export function LanguageSwitcher({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
}) {
  return (
    <div className="inline-flex items-center h-9 p-0.5 rounded-xl border bg-card border-line text-ink-soft shadow-sm transition-colors shrink-0">
      <button
        type="button"
        onClick={() => onChange("id")}
        className={
          "h-8 w-8 flex items-center justify-center rounded-[10px] text-xs font-bold transition-all " +
          (lang === "id" ? "bg-emerald-600 text-white shadow-sm" : "text-ink-faint hover:text-ink")
        }
        title="Bahasa Indonesia"
      >
        ID
      </button>
      <button
        type="button"
        onClick={() => onChange("en")}
        className={
          "h-8 w-8 flex items-center justify-center rounded-[10px] text-xs font-bold transition-all " +
          (lang === "en" ? "bg-emerald-600 text-white shadow-sm" : "text-ink-faint hover:text-ink")
        }
        title="English"
      >
        EN
      </button>
    </div>
  );
}
