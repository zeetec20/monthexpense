import { useSyncExternalStore } from "react";
import { getQuota, subscribeQuota, type Quota, type QuotaGroup } from "@/lib/entry-quota";

/** Reactive read of the cached daily quota for one group (scan/voice/text)
 * — same useSyncExternalStore + module-level pub/sub shape as
 * usePwaUpdateStatus.ts, so a badge/gate anywhere in the tree re-renders
 * the instant any other component records a fresh number. */
export function useEntryQuota(group: QuotaGroup): Quota | undefined {
  return useSyncExternalStore(subscribeQuota, () => getQuota(group), () => undefined);
}
