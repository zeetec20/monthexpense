import { useSyncExternalStore } from "react";
import { subscribePwaUpdate, getPwaUpdating } from "@/pwa-register";

export function usePwaUpdateStatus(): boolean {
  return useSyncExternalStore(subscribePwaUpdate, getPwaUpdating, () => false);
}
