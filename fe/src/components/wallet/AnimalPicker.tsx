import { AnimalAvatar } from "@/components/ui/AnimalAvatar";
import { WALLET_ANIMALS, type WalletAnimal } from "@/features/wallet/wallet.schema";

/** Grid of the 8 available wallet icons — used on the add-wallet form,
 * which pre-selects a random one (see wallet.schema.ts's randomAnimal)
 * and lets the user override it here before submitting. */
export function AnimalPicker({ value, onChange }: { value: WalletAnimal; onChange: (animal: WalletAnimal) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WALLET_ANIMALS.map((animal) => (
        <button
          key={animal}
          type="button"
          onClick={() => onChange(animal)}
          aria-label={animal}
          aria-pressed={value === animal}
          className={
            "rounded-xl transition-all " +
            (value === animal ? "ring-2 ring-brand ring-offset-1 ring-offset-card" : "opacity-60 hover:opacity-100")
          }
        >
          <AnimalAvatar animal={animal} className="w-9 h-9" iconClassName="w-4.5 h-4.5" />
        </button>
      ))}
    </div>
  );
}
