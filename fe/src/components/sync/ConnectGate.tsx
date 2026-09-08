import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { t, translateBackendMessage, type Lang, type TKey } from "@/i18n/translations";
import {
  exchangeEmailForSecret,
  fetchGoogleEmail,
  requestGoogleAccessToken,
} from "@/features/sync/google-auth";
import {
  findExistingSheet,
  provisionSheet,
  readConfigSecret,
  writeConfigSecret,
  type ProvisionStep,
} from "@/features/sync/google-provision.client";
import type { ConnectStep } from "@/features/sync/sync.store";

type Phase = "idle" | "signing-in" | "verifying" | ProvisionStep | "connecting" | "error";

const PROVISION_STEP_LABEL: Record<ProvisionStep, TKey> = {
  searching: "googleSearching",
  "creating-sheet": "googleCreatingSheet",
  "building-structure": "googleBuildingStructure",
};
// Same map connect() sets this exact step sequence regardless of how the
// spreadsheetId/secret were obtained.
const CONNECT_STEP_LABEL: Record<Exclude<ConnectStep, null>, TKey> = {
  verifying: "connectStepVerifying",
  merging: "connectStepMerging",
  saving: "connectStepSaving",
};

/**
 * Shown on-demand inside a BottomSheet (see App.tsx's `connectOpen`),
 * right before the user's first add-expense action — browsing/filtering
 * works on local data with no connection needed, only pushing an expense
 * to Sheets requires it.
 *
 * Everything happens on this one page, no redirect: a single Google popup
 * gives an access_token this component uses both to read the account's own
 * email (see google-auth.ts) and to find-or-create the spreadsheet
 * directly (see google-provision.client.ts), each step updating visible
 * progress instead of one opaque spinner. Talks to Google Sheets API
 * directly with that same access_token from here on (see
 * sheets-sync.api.ts) — no Apps Script deployment, no one-time "Review
 * permissions" screen to click through.
 */
export const ConnectGate = ({
  onConnect,
  connecting,
  connectStep,
  lang,
}: {
  onConnect: (
    spreadsheetId: string,
    spreadsheetUrl: string,
    secret: string,
    email: string,
  ) => Promise<void>;
  connecting: boolean;
  connectStep: ConnectStep;
  lang: Lang;
}) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setPhase("signing-in");
    try {
      // Single Google popup: one access_token, scoped for both Drive/Sheets
      // and reading this account's own email (see google-auth.ts) — no
      // separate id_token/One Tap step.
      const accessToken = await requestGoogleAccessToken();
      setPhase("verifying");
      const email = await fetchGoogleEmail(accessToken);
      const onStep = (step: ProvisionStep) => setPhase(step);
      const existing = await findExistingSheet(accessToken, onStep);
      const result = existing ?? (await provisionSheet(accessToken, onStep));

      // Prefer whatever secret is already stored in this sheet's Config
      // tab over freshly minting one — exchangeEmailForSecret can only
      // ever return a standard-tier secret, so always re-deriving on
      // reconnect would silently downgrade a premium user back to
      // standard every time they sign in on a new device or after
      // clearing storage. A brand-new sheet (or one created before this
      // existed) has nothing stored yet, so it falls back to minting the
      // standard secret and persists it for next time.
      const stored = existing ? await readConfigSecret(accessToken, result.spreadsheetId) : null;
      const secret = stored?.secret ?? (await exchangeEmailForSecret(email));
      if (!stored) await writeConfigSecret(accessToken, result.spreadsheetId, secret, email);

      setPhase("connecting");
      await onConnect(result.spreadsheetId, result.spreadsheetUrl, secret, email);
    } catch (err) {
      setError(
        err instanceof Error
          ? translateBackendMessage(err.message, lang)
          : t(lang, "connectErrorNoCode"),
      );
      setPhase("error");
    }
  };

  const provisioningLabel =
    phase === "signing-in"
      ? t(lang, "googleSigningIn")
      : phase === "verifying"
        ? t(lang, "googleVerifying")
        : phase === "connecting"
          ? connecting && connectStep
            ? t(lang, CONNECT_STEP_LABEL[connectStep])
            : t(lang, "googleSigningIn")
          : phase in PROVISION_STEP_LABEL
            ? t(lang, PROVISION_STEP_LABEL[phase as ProvisionStep])
            : null;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-1 py-2 text-center">
      <img src="/icon-512.png" alt="MonthExpense" className="w-10 h-10 rounded-xl" />
      <p className="font-mono text-xs tracking-[0.06em] text-[var(--color-ink-3)] uppercase">
        MonthExpense
      </p>

      {provisioningLabel ? (
        <p className="flex items-center gap-1.5 text-sm text-[var(--color-ink-2)]">
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          {provisioningLabel}
        </p>
      ) : (
        <div className="w-full space-y-3 text-left">
          <p className="text-center text-sm text-[var(--color-ink-2)]">{t(lang, "connectBody")}</p>
          {phase === "error" && error && (
            <p className="text-center text-sm text-[var(--color-error)]">{error}</p>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
            <GoogleIcon className="w-4 h-4" />
            {t(lang, "googleLoginButton")}
          </Button>
          <p className="text-center text-[10px] text-ink-faint">
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>{" "}
            ·{" "}
            <a href="/terms" className="underline">
              Terms of Service
            </a>
          </p>
        </div>
      )}
    </div>
  );
};
