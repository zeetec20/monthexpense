import {
  Cat,
  Dog,
  Rabbit,
  Squirrel,
  Bird,
  Fish,
  PawPrint,
  Turtle,
  type LucideIcon,
} from "lucide-react";
import type { WalletAnimal } from "@/features/wallet/wallet.schema";

// Ported from expense-tracker's AnimalAvatar.tsx — "panda" slot swapped for
// PawPrint (see wallet.schema.ts's WALLET_ANIMALS comment).
const ANIMAL_MAP: Record<WalletAnimal, { Icon: LucideIcon; chip: string }> = {
  cat: { Icon: Cat, chip: "bg-amber-400/20 text-amber-600 dark:text-amber-300" },
  dog: { Icon: Dog, chip: "bg-rose-400/20 text-rose-600 dark:text-rose-300" },
  rabbit: { Icon: Rabbit, chip: "bg-sky-400/20 text-sky-600 dark:text-sky-300" },
  squirrel: { Icon: Squirrel, chip: "bg-orange-400/20 text-orange-600 dark:text-orange-300" },
  bird: { Icon: Bird, chip: "bg-teal-400/20 text-teal-600 dark:text-teal-300" },
  fish: { Icon: Fish, chip: "bg-cyan-400/20 text-cyan-600 dark:text-cyan-300" },
  paw: { Icon: PawPrint, chip: "bg-slate-400/20 text-slate-600 dark:text-slate-300" },
  turtle: { Icon: Turtle, chip: "bg-lime-400/20 text-lime-600 dark:text-lime-300" },
};

export function AnimalAvatar({
  animal,
  className = "",
  iconClassName = "w-4 h-4",
}: {
  animal: WalletAnimal;
  className?: string;
  iconClassName?: string;
}) {
  const { Icon, chip } = ANIMAL_MAP[animal] ?? ANIMAL_MAP.cat;
  return (
    <div className={`flex items-center justify-center shrink-0 rounded-xl ${chip} ${className}`}>
      <Icon className={iconClassName} />
    </div>
  );
}
