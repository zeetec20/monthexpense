import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePwaUpdateStatus } from "@/hooks/usePwaUpdateStatus";
import { isStandalone } from "@/hooks/usePwaInstall";
import { PWA_UPDATE_MARKER } from "@/pwa-register";
import { t, type Lang } from "@/i18n/translations";

/** Blocking "Updating…" modal while a new service-worker version installs,
 * followed by a one-time "Updated!" success modal read off a sessionStorage
 * marker set right before that reload (a full navigation, so it can't just
 * be React state carried across it). PWA-only — a regular browser tab gets
 * the exact same automatic update-and-reload (pwa-register.ts's
 * onNeedRefresh unconditionally calls updateSW() regardless of this
 * component), it just doesn't see any UI for it; only an installed app has
 * no other way to notice a reload just happened underneath it. */
export const PwaUpdateModal = ({ lang }: { lang: Lang }) => {
  const updating = usePwaUpdateStatus();
  const [justUpdated, setJustUpdated] = useState(() => {
    const seen = sessionStorage.getItem(PWA_UPDATE_MARKER) === "1";
    if (seen) sessionStorage.removeItem(PWA_UPDATE_MARKER);
    return seen;
  });

  if (!isStandalone()) return null;

  return (
    <>
      <Dialog open={updating}>
        <DialogContent
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="sm:max-w-xs text-center"
        >
          <DialogHeader className="items-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
            <DialogTitle>{t(lang, "pwaUpdatingTitle")}</DialogTitle>
            <DialogDescription>{t(lang, "pwaUpdatingBody")}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={justUpdated} onOpenChange={setJustUpdated}>
        <DialogContent className="sm:max-w-xs text-center">
          <DialogHeader className="items-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            <DialogTitle>{t(lang, "pwaUpdatedTitle")}</DialogTitle>
            <DialogDescription>{t(lang, "pwaUpdatedBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="w-full" onClick={() => setJustUpdated(false)}>
              {t(lang, "pwaUpdatedOk")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
