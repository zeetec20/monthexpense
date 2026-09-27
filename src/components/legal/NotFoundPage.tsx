import { Button } from "@/components/ui/button";
import { LegalPageShell } from "./LegalPageShell";

export const NotFoundPage = () => {
  return (
    <LegalPageShell title="Page not found">
      <p>There's nothing at this address — it may be mistyped or no longer exists.</p>
      <Button asChild className="mt-2">
        <a href="/">Back to MonthExpense</a>
      </Button>
    </LegalPageShell>
  );
};
