import { useCallback, useState } from "react";
import type { Lang } from "@/i18n/translations";

const STORAGE_KEY = "expense-notes.language.v1";

const readStoredLang = (): Lang => {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored === "en" || stored === "id") return stored;
  // First-ever visit, nothing chosen yet — follow the phone's language.
  const sysLang = typeof navigator !== "undefined" ? navigator.language : "";
  return sysLang.toLowerCase().startsWith("id") ? "id" : "en";
};

export const useLanguage = () => {
  const [lang, setLang] = useState<Lang>(readStoredLang);

  const setLanguage = useCallback((next: Lang) => {
    setLang(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return { lang, setLanguage };
};
