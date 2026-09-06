import { LegalPageShell } from "./LegalPageShell";

export function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="August 29, 2026">
      <p>
        MonthExpense is a personal expense tracker. This page explains what data it touches, where it lives, and why.
      </p>

      <h2>Your expenses stay on your device</h2>
      <p>
        Expenses, wallets, and settings are stored locally in your browser. We never see them unless you turn on
        Google Sheets sync.
      </p>

      <h2>Google Sheets sync (optional)</h2>
      <p>
        Signing in with Google creates a private spreadsheet in your own Google Drive, plus a small Apps Script
        deployment that reads and writes it. We request these Google permissions:
      </p>
      <ul>
        <li>Your email address, to recognize you on future logins.</li>
        <li><code>drive.file</code> — only to create and later find that one spreadsheet, nothing else in your Drive.</li>
        <li><code>script.projects</code> / <code>script.deployments</code> — only to set up that spreadsheet's sync deployment.</li>
      </ul>
      <p>
        Your expense data lives in that spreadsheet, in your own Google account. Our server never stores it — it
        only derives a one-way sync key from your email (so it can recognize your sheet later). It never receives
        your Google access token; that stays in your browser the whole time.
      </p>

      <h2>Receipt scanning and voice entry (optional)</h2>
      <p>
        A scanned photo, voice recording, or typed note you submit is sent once to our backend (Cloudflare Workers
        AI) to extract structured data, then discarded. It isn't stored afterward.
      </p>

      <h2>Third parties</h2>
      <p>Google (sign-in, Drive, Sheets, Apps Script) and Cloudflare (hosting, AI parsing). No advertising or analytics trackers.</p>

      <h2>Your controls</h2>
      <ul>
        <li>Disconnect anytime from the Sync menu — stops all syncing immediately.</li>
        <li>Delete the spreadsheet from your Drive whenever you like.</li>
        <li>
          Revoke MonthExpense's Google access anytime at{" "}
          <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>

      <h2>Contact</h2>
      <p>Questions about this policy: jusles363@gmail.com</p>
    </LegalPageShell>
  );
}
