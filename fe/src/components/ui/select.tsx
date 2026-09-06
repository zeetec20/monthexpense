"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useShellPortalContainer } from "@/components/ui/bottom-sheet"

/** Custom-styled select built on radix-ui's Select primitive (already an
 * installed dependency — see button.tsx/dialog.tsx for the same `radix-ui`
 * umbrella import pattern), replacing native <select> across the app. */
function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  // min-w-0 overrides the flex-item default (min-width:auto) that was
  // blocking this from shrinking inside SelectTrigger's flex row; block +
  // truncate then clips a long value to one line with an ellipsis instead
  // of wrapping/overflowing. Radix portals the selected SelectItem's exact
  // children in here (see WalletPicker/CategoryPicker's icon+label spans),
  // so this one fix covers every Select in the app.
  return <SelectPrimitive.Value data-slot="select-value" className={cn("block min-w-0 truncate", className)} {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-2xl border bg-card px-3 py-2 text-[11px] text-ink border-line shadow-sm transition-colors outline-none hover:border-ink-faint/40 focus:border-brand disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-ink-faint [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:opacity-60",
        className,
      )}
      {...props}
    >
      {/* Radix's own Select.Value silently drops any className/style
          passed to it (verified in @radix-ui/react-select's source —
          it destructures both out and never spreads them back onto the
          rendered span), so nothing can ever constrain *that* element's
          width directly. This wrapper is ours, so overflow-hidden here
          reliably clips its content regardless — the one shared fix
          every Select's trigger value goes through. */}
      <span className="flex min-w-0 flex-1 items-center truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-3.5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const container = useShellPortalContainer()
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "relative z-50 max-h-64 min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-2xl border bg-card border-line text-ink shadow-xl shadow-black/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn("p-1", position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)]")}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full items-center gap-2 rounded-xl py-2 pl-2 pr-8 text-xs outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-card-hover data-[state=checked]:font-semibold",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-3.5 text-brand" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem }
