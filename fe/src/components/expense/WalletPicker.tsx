import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimalAvatar } from "@/components/ui/AnimalAvatar";
import { t, type Lang } from "@/i18n/translations";
import type { Wallet } from "@/features/wallet/wallet.schema";

export function WalletPicker({
  id,
  wallets,
  value,
  onChange,
  lang = "id",
  className,
}: {
  id: string;
  wallets: Wallet[];
  value: string;
  onChange: (walletId: string) => void;
  lang?: Lang;
  className?: string;
}) {
  const selected = wallets.find((w) => w.id === value);

  return (
    // min-w-0: this sits in a grid grid-cols-2 row (ManualEntryForm/
    // ExpenseReviewModal) — grid items default to min-width:auto same as
    // flex items, refusing to shrink below the trigger's own content
    // width without this, which is exactly what was defeating the
    // trigger's own truncate fix (nothing ever confined it to its column).
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{t(lang, "walletFieldLabel")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={className}>
          {/* Authored directly instead of leaving SelectValue's children
              empty — Radix's auto-mirrored value node doesn't reliably
              inherit min-w-0/truncate the way this same row does when
              rendered directly below (proven: it truncates correctly
              inside the open dropdown), so a long name overflowed past
              the pill instead of ellipsizing. */}
          <SelectValue>
            {selected && (
              <span className="flex min-w-0 items-center gap-2">
                <AnimalAvatar animal={selected.animal} className="w-5 h-5 shrink-0" iconClassName="w-3 h-3" />
                <span className="min-w-0 flex-1 truncate">{selected.name}</span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {wallets.map((wallet) => (
            <SelectItem key={wallet.id} value={wallet.id}>
              <span className="flex min-w-0 items-center gap-2">
                <AnimalAvatar animal={wallet.animal} className="w-5 h-5 shrink-0" iconClassName="w-3 h-3" />
                <span className="min-w-0 flex-1 truncate">{wallet.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
