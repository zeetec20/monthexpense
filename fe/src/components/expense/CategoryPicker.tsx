import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryLabel, categoryIcon, CATEGORY_COLOR } from "@/features/expense/category-visuals";
import { t, type Lang } from "@/i18n/translations";
import { EXPENSE_CATEGORIES } from "@/features/expense/expense.schema";

export function CategoryPicker({
  id,
  value,
  onChange,
  lang = "id",
  className,
}: {
  id: string;
  value: string;
  onChange: (category: string) => void;
  lang?: Lang;
  className?: string;
}) {
  const selected = EXPENSE_CATEGORIES.find((c) => c.value === value);
  const SelectedIcon = selected ? categoryIcon(selected.value) : null;

  return (
    // min-w-0: same grid-column truncation fix as WalletPicker.
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{t(lang, "categoryFieldLabel")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={className}>
          {/* Authored directly instead of leaving SelectValue's children
              empty — see WalletPicker's identical fix for why Radix's
              auto-mirrored value node doesn't reliably truncate. */}
          <SelectValue>
            {selected && SelectedIcon && (
              <span className="flex min-w-0 items-center gap-2">
                <SelectedIcon className="w-3.5 h-3.5 shrink-0" style={{ color: CATEGORY_COLOR[selected.value] }} />
                <span className="min-w-0 flex-1 truncate">{categoryLabel(selected.value, lang)}</span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {EXPENSE_CATEGORIES.map((category) => {
            const Icon = categoryIcon(category.value);
            return (
              <SelectItem key={category.value} value={category.value}>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: CATEGORY_COLOR[category.value] }} />
                  <span className="min-w-0 flex-1 truncate">{categoryLabel(category.value, lang)}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
