import { LegalPageShell } from "./LegalPageShell";

export const TermsOfServicePage = () => {
  return (
    <LegalPageShell title="Terms of Service" updated="August 29, 2026">
      <p>By using MonthExpense, you agree to these terms.</p>

      <h2>What this is</h2>
      <p>
        MonthExpense is a personal expense-tracking tool. It's provided as-is, free of charge, with
        no guarantee of uptime, accuracy, or fitness for any particular purpose. Google Sheets sync
        depends on Google's Apps Script API, which you have to enable once on your own Google
        account before connecting — we can't do that step for you.
      </p>

      <h2>AI-assisted entry</h2>
      <p>
        Scanned receipts and voice notes are parsed by an AI model. It can misread amounts, dates,
        or merchant names — always check what it captured before relying on it.
      </p>

      <h2>Your account and data</h2>
      <p>
        If you connect Google Sheets, the spreadsheet it creates is yours — it lives in your own
        Google Drive under your own account. You're responsible for who you share that sheet's link
        with and for your own Google account security.
      </p>

      <h2>Changes</h2>
      <p>We can change, suspend, or discontinue the service at any time, without notice.</p>

      <h2>Liability</h2>
      <p>
        MonthExpense is offered with no warranty of any kind. We aren't liable for any loss arising
        from using it, including data loss or financial decisions made from its records.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms: jusles363@gmail.com</p>
    </LegalPageShell>
  );
};
