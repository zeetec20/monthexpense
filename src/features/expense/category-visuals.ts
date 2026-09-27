import {
  Utensils,
  ShoppingBag,
  Car,
  FileText,
  RefreshCw,
  TrendingUp,
  Film,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { t, type Lang, type TKey } from "@/i18n/translations";
import type { ExpenseCategory } from "./expense.schema";

// Colors + icons ported from ../expense-tracker's src/utils/categories.ts,
// mapped onto our real category slugs (that file's own set doesn't line up
// 1:1 — see the per-entry notes below).
export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  food_snack: "#E5B84B", // their "food"
  grocery: "#E8836B", // no direct match — reusing their "shopping" tone
  transportation: "#5E88AD", // their "transport"
  bills: "#D6544A",
  subscription: "#937ED4",
  investment: "#5C8551",
  entertainment: "#C97BA2",
  other: "#8B988D", // their "untagged"
};

export const CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
  food_snack: Utensils,
  grocery: ShoppingBag,
  transportation: Car,
  bills: FileText,
  subscription: RefreshCw,
  investment: TrendingUp,
  entertainment: Film,
  other: Globe,
};

const CATEGORY_LABEL_KEY: Record<ExpenseCategory, TKey> = {
  food_snack: "catFoodSnack",
  grocery: "catGrocery",
  transportation: "catTransportation",
  bills: "catBills",
  subscription: "catSubscription",
  investment: "catInvestment",
  entertainment: "catEntertainment",
  other: "catOther",
};

const toCategory = (value: string | null | undefined): ExpenseCategory => {
  return (value && value in CATEGORY_COLOR ? value : "food_snack") as ExpenseCategory;
};

export const categoryColor = (value: string | null | undefined): string => {
  return CATEGORY_COLOR[toCategory(value)];
};

export const categoryIcon = (value: string | null | undefined): LucideIcon => {
  return CATEGORY_ICON[toCategory(value)];
};

/** Localized category label for the reskinned screens (TransactionsPage/
 * HomeDashboard/AnalyticsPage) — EXPENSE_CATEGORIES's own labels stay
 * English, they back CategoryPicker on the still-English scan/voice/manual
 * review screens. */
export const categoryLabel = (value: string | null | undefined, lang: Lang): string => {
  return t(lang, CATEGORY_LABEL_KEY[toCategory(value)]);
};
