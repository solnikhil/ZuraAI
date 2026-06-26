import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

const DEFAULT_TOOLTIP_DELAY_MS = 450

const TooltipProviderPresenceContext = React.createContext(false)

function TooltipProvider({
  delayDuration = DEFAULT_TOOLTIP_DELAY_MS,
  skipDelayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipProviderPresenceContext.Provider value={true}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
        {...props}
      />
    </TooltipProviderPresenceContext.Provider>
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const hasProvider = React.useContext(TooltipProviderPresenceContext)
  const root = <TooltipPrimitive.Root data-slot="tooltip" {...props} />
  if (hasProvider) return root
  return <TooltipProvider>{root}</TooltipProvider>
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'theme-menu-surface z-50 w-fit rounded-lg px-3 py-1.5 text-xs text-balance text-[var(--theme-text-primary)]',
          'data-[state=delayed-open]:animate-tooltip-in data-[state=closed]:animate-tooltip-out',
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2 translate-y-[calc(-50%_-_1px)] rotate-45 fill-[var(--theme-surface)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
