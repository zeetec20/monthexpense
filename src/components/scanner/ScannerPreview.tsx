import { Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const ScannerPreview = ({ imageUrl }: { imageUrl: string | null }) => {
  return (
    <div className="relative aspect-[3/4] w-full max-w-64 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-paper-2)]">
      {imageUrl ? (
        <img src={imageUrl} alt="Captured receipt" className="size-full object-cover" />
      ) : (
        <>
          <Skeleton className="size-full rounded-none" />
          <Receipt className="absolute inset-0 m-auto size-8 text-[var(--color-ink-3)]" />
        </>
      )}
    </div>
  );
};
