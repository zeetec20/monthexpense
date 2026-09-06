import { useEffect, useState } from "react";

function readOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

/** Tracks browser connectivity via the online/offline window events — used
 * to skip a guaranteed-fail sync push while offline, and to retry it
 * automatically the moment connectivity returns (see sync.store.ts). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(readOnline);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
