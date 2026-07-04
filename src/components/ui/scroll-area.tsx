import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

import { cn } from '@/lib/utils'

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string
  viewportStyle?: React.CSSProperties
  viewportRef?: React.Ref<HTMLDivElement>
}

function ScrollArea({
  className,
  children,
  viewportClassName,
  viewportStyle,
  viewportRef,
  ...props
}: ScrollAreaProps) {
  const internalViewportRef = React.useRef<HTMLDivElement | null>(null)

  const mergedViewportRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      internalViewportRef.current = node

      if (!viewportRef) return

      if (typeof viewportRef === 'function') {
        viewportRef(node)
        return
      }

      viewportRef.current = node
    },
    [viewportRef]
  )

  const normalizedViewportStyle = React.useMemo<React.CSSProperties>(
    () => ({
      overscrollBehavior: 'contain',
      scrollBehavior: 'auto',
      ...viewportStyle,
    }),
    [viewportStyle]
  )

  const handleViewportWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaMode === 0) return

    const viewport = internalViewportRef.current
    if (!viewport) return

    let deltaY = event.deltaY
    let deltaX = event.deltaX

    if (event.deltaMode === 1) {
      const computedLineHeight = Number.parseFloat(window.getComputedStyle(viewport).lineHeight)
      const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 16
      deltaY *= lineHeight
      deltaX *= lineHeight
    } else if (event.deltaMode === 2) {
      deltaY *= viewport.clientHeight
      deltaX *= viewport.clientWidth
    }

    viewport.scrollTop += deltaY
    viewport.scrollLeft += deltaX
    event.preventDefault()
  }, [])

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        ref={mergedViewportRef}
        onWheel={handleViewportWheel}
        className={cn('h-full w-full rounded-[inherit]', viewportClassName)}
        style={normalizedViewportStyle}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className={cn(
          'relative flex-1 rounded-full',
          'bg-white/20 hover:bg-white/30 active:bg-white/40',
          'transition-colors duration-150'
        )}
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
