import { useSyncExternalStore } from "react";
import { subscribePwaUpdate, getPwaUpdating } from "@/pwa-register";

export const usePwaUpdateStatus = (): boolean => {
  return useSyncExternalStore(subscribePwaUpdate, getPwaUpdating, () => false);
};
