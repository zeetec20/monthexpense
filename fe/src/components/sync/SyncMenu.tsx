import { useState } from "react";
import { Loader2, Check, AlertTriangle, Link2, RotateCcw, Unplug, Cloud, WifiOff } from "lucide-react";
import { getConnectedEmail } from "@/features/sync/sheets-sync.api";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WarningCallout } from "@/components/ui/WarningCallout";
import { t, type Lang } from "@/i18n/translations";

interface SyncMenuProps {
  gateStatus: "connected" | "disconnected";
  syncing: boolean;
  status: "idle" | "synced" | "error";
  lastSyncedAt: string | null;
  spreadsheetUrl: string | null;
  onRetry: () => void;
  onRestore: () => void;
  onDisconnect: () => void;
  onConnect: () => void;
  lang: Lang;
  online: boolean;
}

/**
 * Header control replacing expense-tracker's fake, non-functional profile
 * avatar (see HomeDashboard) — this app has no user-profile concept, the
 * connected spreadsheet *is* the identity, so this slot shows real
 * connection status instead. While disconnected, this is just a "Login"
 * shortcut straight to the connect drawer — the sheet below (status/copy-
 * link/restore/disconnect) only ever makes sense once actually connected.
 */
export function SyncMenu({ gateStatus, syncing, status, lastSyncedAt, spreadsheetUrl, onRetry, onRestore, onDisconnect, onConnect, lang, online }: SyncMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);

  function handleDisconnect() {
    setOpen(false);
    onDisconnect();
  }

  function handleCopyLink() {
    if (spreadsheetUrl) void navigator.clipboard.writeText(spreadsheetUrl);
  }

  if (gateStatus !== "connected") {
    return (
      <button
        type="button"
        onClick={onConnect}
        title={t(lang, "login")}
        aria-label={t(lang, "login")}
        className="relative h-9 w-9 grid place-items-center rounded-xl border bg-card border-line text-ink-soft hover:text-ink hover:bg-card-hover transition-colors shadow-sm"
      >
        <Cloud className="w-4 h-4" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t(lang, "syncTitle")}
        className={
          "relative h-9 w-9 grid place-items-center rounded-xl border transition-colors shadow-sm " +
          (!online
            ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
            : "bg-card border-line text-ink-soft hover:text-ink hover:bg-card-hover")
        }
      >
        {!online ? (
          <WifiOff className="w-4 h-4" />
        ) : syncing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === "error" ? (
          <AlertTriangle className="w-4 h-4 text-red-500" />
        ) : (
          <Cloud className="w-4 h-4" />
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t(lang, "syncTitle")}>
        <>
          <div className="pb-2">
            <h3 className="text-sm font-bold text-ink">{t(lang, "syncTitle")}</h3>
            {getConnectedEmail() && <p className="text-xs text-ink-soft">{t(lang, "connectedAs", { email: getConnectedEmail()! })}</p>}
          </div>

          {!online && <WarningCallout>{t(lang, "syncOfflineWarning")}</WarningCallout>}

          <p className="flex items-center gap-1.5 text-sm text-ink-soft">
            {syncing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t(lang, "syncing")}
              </>
            ) : status === "error" ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-red-500">{t(lang, "syncFailed")}</span>
                <button type="button" onClick={onRetry} className="underline underline-offset-2">
                  {t(lang, "retry")}
                </button>
              </>
            ) : lastSyncedAt ? (
              <>
                <Check className="w-3.5 h-3.5" /> {t(lang, "syncedAt", { time: new Date(lastSyncedAt).toLocaleTimeString() })}
              </>
            ) : (
              t(lang, "notSyncedYet")
            )}
          </p>

          <div className="flex flex-col gap-2">
            {spreadsheetUrl && (
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-2 py-2.5 px-3 rounded-2xl border bg-elevated border-line text-ink-soft hover:text-ink hover:bg-card-hover text-xs font-semibold transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" /> {t(lang, "copyLink")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmRestoreOpen(true)}
              className="flex items-center gap-2 py-2.5 px-3 rounded-2xl border bg-elevated border-line text-ink-soft hover:text-ink hover:bg-card-hover text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t(lang, "restoreSheets")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDisconnectOpen(true)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-semibold transition-colors"
            >
              <Unplug className="w-3.5 h-3.5" /> {t(lang, "disconnect")}
            </button>
          </div>
        </>
      </BottomSheet>

      <ConfirmDialog
        open={confirmRestoreOpen}
        onOpenChange={setConfirmRestoreOpen}
        title={t(lang, "confirmRestoreTitle")}
        description={t(lang, "confirmRestoreBody")}
        confirmLabel={t(lang, "restoreSheets")}
        cancelLabel={t(lang, "cancel")}
        onConfirm={onRestore}
      />
      <ConfirmDialog
        open={confirmDisconnectOpen}
        onOpenChange={setConfirmDisconnectOpen}
        title={t(lang, "confirmDisconnectTitle")}
        description={t(lang, "confirmDisconnectBody")}
        confirmLabel={t(lang, "disconnect")}
        cancelLabel={t(lang, "cancel")}
        onConfirm={handleDisconnect}
        destructive
      />
    </>
  );
}
