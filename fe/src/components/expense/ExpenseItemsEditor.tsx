import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NumberInput, type NumberInputProps } from "@/components/ui/number-input";
import { computeItemTotal, type ExpenseReceiptItem } from "@/features/expense/expense.schema";
import { formatCurrency } from "@/lib/format";

const BLANK_ITEM: ExpenseReceiptItem = { name: "", quantity: 1, unitPrice: null, total: null };

export type NumberFieldProps = NumberInputProps;

/** Formatted-thousands number input (see NumberInput) — kept as its own
 * export/name since ExpenseReviewModal already imports NumberField from
 * here. */
export function NumberField(props: NumberFieldProps) {
  return <NumberInput {...props} />;
}

interface ExpenseItemsEditorProps {
  items: ExpenseReceiptItem[];
  editing: boolean;
  onChange: (items: ExpenseReceiptItem[]) => void;
}

/**
 * View mode: read-only "qty × unit price = total" rows. Edit mode: name,
 * quantity, and unit price are inputs; total is always computed
 * (quantity × unit price — see computeItemTotal), never its own field, so it
 * can't silently disagree with the two numbers it comes from. Rows can be
 * added/removed only in edit mode.
 */
export function ExpenseItemsEditor({ items, editing, onChange }: ExpenseItemsEditorProps) {
  if (!editing) {
    if (items.length === 0) return <p className="text-sm text-[var(--color-ink-3)]">No line items.</p>;
    return (
      <ul className="space-y-2.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-start justify-between gap-4 text-sm">
            <div>
              <p className="font-medium">{item.name || "Unnamed item"}</p>
              <p className="text-[var(--color-ink-3)]">
                {item.quantity ?? "–"} × {formatCurrency(item.unitPrice, "IDR")}
              </p>
            </div>
            <p className="shrink-0 font-medium tabular-nums">{formatCurrency(computeItemTotal(item), "IDR")}</p>
          </li>
        ))}
      </ul>
    );
  }

  function updateItem(index: number, patch: Partial<ExpenseReceiptItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1 space-y-1.5">
            <Input
              value={item.name ?? ""}
              onChange={(e) => updateItem(index, { name: e.target.value || null })}
              placeholder="Item name"
              aria-label={`Item ${index + 1} name`}
            />
            <div className="flex items-center gap-1.5">
              <NumberField
                className="w-14"
                min="0"
                decimal
                placeholder="Qty"
                aria-label={`Item ${index + 1} quantity`}
                value={item.quantity}
                onChange={(quantity) => updateItem(index, { quantity })}
              />
              <span className="shrink-0 text-sm text-[var(--color-ink-3)]">×</span>
              <NumberField
                className="flex-1"
                min="0"
                placeholder="Unit price"
                aria-label={`Item ${index + 1} unit price`}
                value={item.unitPrice}
                onChange={(unitPrice) => updateItem(index, { unitPrice })}
              />
              <span className="shrink-0 text-sm text-[var(--color-ink-3)]">=</span>
              <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                {formatCurrency(computeItemTotal(item), "IDR")}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Remove item ${index + 1}`}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onChange([...items, { ...BLANK_ITEM }])}
      >
        <Plus className="size-3.5" /> Add item
      </Button>
    </div>
  );
}
