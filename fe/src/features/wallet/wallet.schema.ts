import { z } from "zod";

export const WALLET_MAX = 15;
export const DEFAULT_WALLET_NAME = "Main Wallet";

// Ported from expense-tracker's AnimalAvatar — "panda" swapped for "paw"
// (PawPrint icon) since this repo's installed lucide-react has no Panda icon.
export const WALLET_ANIMALS = ["cat", "dog", "rabbit", "squirrel", "bird", "fish", "paw", "turtle"] as const;
export type WalletAnimal = (typeof WALLET_ANIMALS)[number];

/** Default suggestion for a brand-new wallet's icon — the add-wallet form
 * re-rolls this each time it's shown, letting the picker (AnimalPicker)
 * override it before submit. */
export function randomAnimal(): WalletAnimal {
  return WALLET_ANIMALS[Math.floor(Math.random() * WALLET_ANIMALS.length)];
}

export const walletSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  // .default("cat") backfills wallets stored before this field existed.
  animal: z.enum(WALLET_ANIMALS).default("cat"),
});

export type Wallet = z.infer<typeof walletSchema>;
