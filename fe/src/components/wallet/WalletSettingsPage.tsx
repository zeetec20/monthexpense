import { useState } from "react";
import { Trash2, Plus, Pencil } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimalAvatar } from "@/components/ui/AnimalAvatar";
import { AnimalPicker } from "@/components/wallet/AnimalPicker";
import { WALLET_MAX, randomAnimal, type WalletAnimal } from "@/features/wallet/wallet.schema";
import { getRemoveBlockReason } from "@/features/wallet/wallet.store";
import type { Wallet } from "@/features/wallet/wallet.schema";
import type { Expense } from "@/features/expense/expense.schema";

/** Inline-editable name — blur-to-save, same pattern as ExpenseDetailModal's title field.
 * Icon is editable the same way: tap it to expand the same AnimalPicker
 * grid the add-wallet form uses, right below the row — no separate
 * dialog, matching this sheet's "everything happens inline" pattern. */
function WalletRow({
  wallet,
  blockReason,
  onRename,
  onChangeAnimal,
  onRemove,
}: {
  wallet: Wallet;
  blockReason: string | null;
  onRename: (name: string) => void;
  onChangeAnimal: (animal: WalletAnimal) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(wallet.name);
  const [pickingAnimal, setPickingAnimal] = useState(false);

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPickingAnimal((v) => !v)}
          aria-label={`Change icon for ${wallet.name}`}
          aria-pressed={pickingAnimal}
          className="relative shrink-0 rounded-xl ring-offset-1 ring-offset-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <AnimalAvatar animal={wallet.animal} className="w-8 h-8" iconClassName="w-4 h-4" />
          <Pencil className="absolute -right-1 -bottom-1 size-3 rounded-full bg-card p-0.5 text-ink-faint shadow-sm" />
        </button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== wallet.name) onRename(trimmed);
            else setName(wallet.name);
          }}
          aria-label={`Rename ${wallet.name}`}
          className="h-9"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!!blockReason}
          title={blockReason ?? "Delete wallet"}
          onClick={onRemove}
          aria-label={`Delete ${wallet.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {pickingAnimal && (
        <AnimalPicker
          value={wallet.animal}
          onChange={(animal) => {
            onChangeAnimal(animal);
            setPickingAnimal(false);
          }}
        />
      )}
    </li>
  );
}

export function WalletSettingsPage({
  open,
  onClose,
  wallets,
  expenses,
  onAdd,
  onRename,
  onUpdateAnimal,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  wallets: Wallet[];
  expenses: Expense[];
  onAdd: (name: string, animal: WalletAnimal) => void;
  onRename: (id: string, name: string) => void;
  onUpdateAnimal: (id: string, animal: WalletAnimal) => void;
  onRemove: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newAnimal, setNewAnimal] = useState<WalletAnimal>(() => randomAnimal());
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const atCap = wallets.length >= WALLET_MAX;

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed || atCap) return;
    onAdd(trimmed, newAnimal);
    setNewName("");
    setNewAnimal(randomAnimal());
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Wallets" className="max-h-[85dvh] flex flex-col">
      <div className="shrink-0 flex items-baseline gap-2 pb-2">
        <h3 className="text-sm font-bold text-ink">Wallets</h3>
        <span className="font-mono text-xs text-ink-faint">
          {wallets.length}/{WALLET_MAX}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
        <ul className="space-y-2">
          {wallets.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              blockReason={getRemoveBlockReason(wallet.id, wallets, expenses)}
              onRename={(name) => onRename(wallet.id, name)}
              onChangeAnimal={(animal) => onUpdateAnimal(wallet.id, animal)}
              onRemove={() => setConfirmRemoveId(wallet.id)}
            />
          ))}
        </ul>

        <div className="space-y-2 border-t border-[var(--color-rule)] pt-3">
          <AnimalPicker value={newAnimal} onChange={setNewAnimal} />
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={atCap ? `Limit reached (${WALLET_MAX})` : "New wallet name"}
              disabled={atCap}
              className="h-9"
            />
            <Button type="button" variant="outline" size="icon-sm" disabled={atCap || !newName.trim()} onClick={handleAdd}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemoveId !== null}
        onOpenChange={(o) => !o && setConfirmRemoveId(null)}
        title={`Delete "${wallets.find((w) => w.id === confirmRemoveId)?.name ?? ""}"?`}
        description="This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => confirmRemoveId && onRemove(confirmRemoveId)}
      />
    </BottomSheet>
  );
}
