import * as React from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

export interface TooltipIconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'title'
> {
  /** Text shown in the custom tooltip. */
  tooltip: string
  children: React.ReactNode
}

/**
 * An icon button that shows the app's custom Radix tooltip instead of the
 * browser's native `title` tooltip.
 *
 * `aria-label` defaults to the tooltip text when not provided, so accessibility
 * is preserved while the native tooltip is removed.
 *
 * Disabled buttons are wrapped in a span so the tooltip still works (disabled
 * native buttons do not receive pointer events).
 */
export const TooltipIconButton = React.forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ tooltip, children, disabled, 'aria-label': ariaLabel, className, ...props }, ref) => {
    const label = ariaLabel ?? tooltip
    const button = (
      <button
        type="button"
        ref={ref}
        disabled={disabled}
        aria-label={label}
        aria-disabled={disabled ?? undefined}
        className={className}
        {...props}
      >
        {children}
      </button>
    )

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{disabled ? <span>{button}</span> : button}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
)
TooltipIconButton.displayName = 'TooltipIconButton'
