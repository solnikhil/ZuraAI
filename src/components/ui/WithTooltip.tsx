import * as React from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

export interface WithTooltipProps {
  /** Text shown in the custom tooltip. */
  tooltip: string
  children: React.ReactElement
}

/**
 * Wraps any single React element with the app's custom Radix tooltip.
 *
 * Use this for non-button elements that previously relied on the native
 * `title` attribute (e.g. resize handles, status dots, truncated text spans).
 * For icon buttons, prefer `TooltipIconButton`.
 */
export function WithTooltip({ tooltip, children }: WithTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
