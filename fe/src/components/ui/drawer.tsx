"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerPortal(props: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("absolute inset-0 z-50 bg-black/60 backdrop-blur-sm", className)}
      {...props}
    />
  );
}

// vaul's real Handle, not a plain div — required for `handleOnly` (see
// bottom-sheet.tsx) to actually work: vaul's Content skips its own drag
// logic entirely when handleOnly is set, and only Handle's pointer
// handlers still call into it, so content can scroll freely and swipe-
// to-dismiss only starts from this element. `!` (important) classes
// guarantee our exact visual style wins over vaul's own injected default
// handle CSS, which loads (and would otherwise win on a specificity tie)
// after our stylesheet.
function DrawerHandle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Handle>) {
  return (
    <DrawerPrimitive.Handle
      data-slot="drawer-handle"
      className={cn(
        "!mx-auto !my-0 !h-1 !w-12 !shrink-0 !rounded-full !bg-ink-faint/50 !opacity-100 cursor-grab active:cursor-grabbing",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "absolute inset-x-0 bottom-0 z-50 flex flex-col bg-card border-t border-line rounded-t-[32px] p-6 space-y-4 outline-none",
          className,
        )}
        {...props}
      >
        <DrawerHandle />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("sr-only", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
};
