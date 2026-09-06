import { useCallback, useState } from "react";

const STORAGE_KEY = "expense-notes.seen-reminders.v1";

function readStoredSeen(): Set<string> {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored) as string[]);
  } catch {
    return new Set();
  }
}

/** Tracks which upcoming-reminder expense ids the user has already seen
 * (opened the notification drawer with), so the bell's unread dot only
 * lights up for genuinely new items instead of staying on forever just
 * because something is still due soon. */
export function useSeenReminders() {
  const [seen, setSeen] = useState<Set<string>>(readStoredSeen);

  const markSeen = useCallback((ids: string[]) => {
    setSeen((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isUnread = useCallback((ids: string[]) => ids.some((id) => !seen.has(id)), [seen]);

  return { markSeen, isUnread };
}
