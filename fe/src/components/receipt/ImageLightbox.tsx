import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useShellPortalContainer } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center gap-2">
      <Button type="button" size="icon" variant="secondary" onClick={() => zoomOut()} aria-label="Zoom out">
        <ZoomOut />
      </Button>
      <Button type="button" size="icon" variant="secondary" onClick={() => resetTransform()} aria-label="Reset zoom">
        <RotateCcw />
      </Button>
      <Button type="button" size="icon" variant="secondary" onClick={() => zoomIn()} aria-label="Zoom in">
        <ZoomIn />
      </Button>
    </div>
  );
}

export function ImageLightbox({
  imageUrl,
  open,
  onClose,
}: {
  imageUrl: string | null;
  open: boolean;
  onClose: () => void;
}) {
  // Portals into the same shell frame BottomSheet/SelectContent already
  // confine themselves to (useShellPortalContainer) — without this,
  // Radix's default document.body portal + DialogContent's own
  // position:fixed base sizes/positions against the *real* browser
  // viewport (fixed's containing block ignores DOM ancestry), so on
  // desktop the lightbox filled the whole window instead of just the
  // centered phone-shell frame. `absolute` below (overriding the base
  // `fixed`) is what actually confines it once portaled here — position:
  // fixed would still ignore the shell regardless of portal location.
  const container = useShellPortalContainer();

  if (!imageUrl) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        container={container}
        className="absolute inset-0 max-w-none translate-x-0 translate-y-0 flex items-center justify-center rounded-none border-0 bg-black/95 p-0"
      >
        <DialogTitle className="sr-only">Receipt photo</DialogTitle>
        <TransformWrapper doubleClick={{ mode: "toggle" }}>
          <TransformComponent wrapperClass="!size-full" contentClass="!size-full !items-center !justify-center">
            <img src={imageUrl} alt="Scanned receipt" className="max-h-full max-w-full object-contain" />
          </TransformComponent>
          <ZoomControls />
        </TransformWrapper>
      </DialogContent>
    </Dialog>
  );
}
