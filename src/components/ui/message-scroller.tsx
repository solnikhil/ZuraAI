import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type ScrollDirection = 'start' | 'end'
type ScrollToMessageOptions = ScrollIntoViewOptions & { align?: ScrollLogicalPosition }

interface MessageScrollerContextValue {
  viewport: HTMLElement | null
  setViewport: (node: HTMLElement | null) => void
  setContent: (node: HTMLElement | null) => void
  atStart: boolean
  atEnd: boolean
  currentAnchorId: string | null
  visibleMessageIds: string[]
  scrollTo: (direction: ScrollDirection, behavior?: ScrollBehavior) => void
  scrollToMessage: (messageId: string, options?: ScrollToMessageOptions) => void
}

const MessageScrollerContext = React.createContext<MessageScrollerContextValue | null>(null)

function useMessageScroller() {
  const context = React.useContext(MessageScrollerContext)
  if (!context) {
    throw new Error('useMessageScroller must be used inside MessageScrollerProvider')
  }
  return context
}

function useMessageScrollerScrollable(direction: ScrollDirection = 'end') {
  const context = useMessageScroller()
  return direction === 'end' ? !context.atEnd : !context.atStart
}

function useMessageScrollerVisibility(): {
  currentAnchorId: string | null
  visibleMessageIds: string[]
}
function useMessageScrollerVisibility(direction: ScrollDirection): boolean
function useMessageScrollerVisibility(direction?: ScrollDirection) {
  const context = useMessageScroller()
  if (direction) {
    return direction === 'end' ? !context.atEnd : !context.atStart
  }

  return {
    currentAnchorId: context.currentAnchorId,
    visibleMessageIds: context.visibleMessageIds,
  }
}

interface MessageScrollerProviderProps {
  children: React.ReactNode
  autoScroll?: boolean
  defaultScrollPosition?: ScrollDirection
  scrollMargin?: number
}

function MessageScrollerProvider({
  children,
  autoScroll = false,
  defaultScrollPosition = 'end',
  scrollMargin = 16,
}: MessageScrollerProviderProps) {
  const [viewport, setViewport] = React.useState<HTMLElement | null>(null)
  const [content, setContent] = React.useState<HTMLElement | null>(null)
  const [atStart, setAtStart] = React.useState(true)
  const [atEnd, setAtEnd] = React.useState(true)
  const [currentAnchorId, setCurrentAnchorId] = React.useState<string | null>(null)
  const [visibleMessageIds, setVisibleMessageIds] = React.useState<string[]>([])
  const atEndRef = React.useRef(true)

  const updateMetrics = React.useCallback(() => {
    if (!viewport) {
      atEndRef.current = true
      setAtStart(true)
      setAtEnd(true)
      setCurrentAnchorId(null)
      setVisibleMessageIds([])
      return
    }

    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    const nextAtStart = viewport.scrollTop <= scrollMargin
    const nextAtEnd = maxScrollTop - viewport.scrollTop <= scrollMargin

    atEndRef.current = nextAtEnd
    setAtStart((current) => (current === nextAtStart ? current : nextAtStart))
    setAtEnd((current) => (current === nextAtEnd ? current : nextAtEnd))

    const viewportRect = viewport.getBoundingClientRect()
    const visibleItems = Array.from(
      viewport.querySelectorAll<HTMLElement>('[data-message-scroller-id]')
    )
      .map((item) => {
        const rect = item.getBoundingClientRect()
        const visible = rect.bottom >= viewportRect.top + 12 && rect.top <= viewportRect.bottom - 12
        return {
          id: item.dataset.messageScrollerId ?? '',
          top: rect.top,
          visible,
        }
      })
      .filter((item) => item.id && item.visible)

    const nextVisibleIds = visibleItems.map((item) => item.id)
    const nextAnchorId =
      visibleItems
        .slice()
        .sort(
          (left, right) =>
            Math.abs(left.top - viewportRect.top) - Math.abs(right.top - viewportRect.top)
        )[0]?.id ?? null

    setVisibleMessageIds((current) =>
      arraysEqual(current, nextVisibleIds) ? current : nextVisibleIds
    )
    setCurrentAnchorId((current) => (current === nextAnchorId ? current : nextAnchorId))
  }, [scrollMargin, viewport])

  const scrollTo = React.useCallback(
    (direction: ScrollDirection, behavior: ScrollBehavior = 'smooth') => {
      if (!viewport) return

      const top = direction === 'end' ? viewport.scrollHeight : 0
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ top, behavior })
      } else {
        viewport.scrollTop = top
      }

      if (direction === 'end') {
        atEndRef.current = true
      }
      requestAnimationFrame(updateMetrics)
    },
    [updateMetrics, viewport]
  )

  const scrollToMessage = React.useCallback(
    (
      messageId: string,
      options: ScrollToMessageOptions = { block: 'start', behavior: 'smooth' }
    ) => {
      if (!viewport) return

      const { align, ...scrollOptions } = options
      const escapedId =
        typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(messageId)
          : messageId.replace(/["\\]/g, '\\$&')
      const item = viewport.querySelector<HTMLElement>(`[data-message-scroller-id="${escapedId}"]`)

      item?.scrollIntoView({
        ...scrollOptions,
        block: scrollOptions.block ?? align,
      })
      requestAnimationFrame(updateMetrics)
    },
    [updateMetrics, viewport]
  )

  React.useLayoutEffect(() => {
    if (!viewport) return

    viewport.scrollTop = defaultScrollPosition === 'end' ? viewport.scrollHeight : 0
    updateMetrics()
  }, [defaultScrollPosition, updateMetrics, viewport])

  React.useEffect(() => {
    if (!viewport) return

    viewport.addEventListener('scroll', updateMetrics, { passive: true })
    window.addEventListener('resize', updateMetrics)
    updateMetrics()

    return () => {
      viewport.removeEventListener('scroll', updateMetrics)
      window.removeEventListener('resize', updateMetrics)
    }
  }, [updateMetrics, viewport])

  React.useEffect(() => {
    if (!viewport || typeof ResizeObserver === 'undefined') return

    let frame: number | null = null
    const scheduleUpdate = () => {
      if (frame != null) cancelAnimationFrame(frame)
      const shouldStickToEnd = autoScroll && atEndRef.current
      frame = requestAnimationFrame(() => {
        frame = null
        if (shouldStickToEnd) {
          viewport.scrollTop = viewport.scrollHeight
        }
        updateMetrics()
      })
    }

    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(viewport)
    if (content) observer.observe(content)

    return () => {
      if (frame != null) cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [autoScroll, content, updateMetrics, viewport])

  React.useLayoutEffect(() => {
    if (!viewport) return
    if (autoScroll && atEndRef.current) {
      viewport.scrollTop = viewport.scrollHeight
    }
    updateMetrics()
  })

  const value = React.useMemo<MessageScrollerContextValue>(
    () => ({
      viewport,
      setViewport,
      setContent,
      atStart,
      atEnd,
      currentAnchorId,
      visibleMessageIds,
      scrollTo,
      scrollToMessage,
    }),
    [atEnd, atStart, currentAnchorId, scrollTo, scrollToMessage, viewport, visibleMessageIds]
  )

  return <MessageScrollerContext.Provider value={value}>{children}</MessageScrollerContext.Provider>
}

const MessageScroller = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="message-scroller"
      className={cn(
        'group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden',
        className
      )}
      {...props}
    />
  )
)
MessageScroller.displayName = 'MessageScroller'

const MessageScrollerViewport = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, onScroll, style, ...props }, forwardedRef) => {
    const { setViewport } = useMessageScroller()

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        setViewport(node)
        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [forwardedRef, setViewport]
    )

    return (
      <div
        ref={setRefs}
        data-slot="message-scroller-viewport"
        className={cn('size-full min-h-0 min-w-0 overflow-y-auto overscroll-contain', className)}
        style={{ ...style, overflowAnchor: 'none' } as React.CSSProperties}
        onScroll={onScroll}
        {...props}
      />
    )
  }
)
MessageScrollerViewport.displayName = 'MessageScrollerViewport'

const MessageScrollerContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, forwardedRef) => {
    const { setContent } = useMessageScroller()

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        setContent(node)
        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [forwardedRef, setContent]
    )

    return (
      <div
        ref={setRefs}
        data-slot="message-scroller-content"
        className={cn('flex h-max min-h-full flex-col', className)}
        {...props}
      />
    )
  }
)
MessageScrollerContent.displayName = 'MessageScrollerContent'

interface MessageScrollerItemProps extends React.ComponentProps<'div'> {
  scrollAnchor?: boolean
  messageId?: string
}

const MessageScrollerItem = React.forwardRef<HTMLDivElement, MessageScrollerItemProps>(
  ({ className, scrollAnchor = false, messageId, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="message-scroller-item"
      data-scroll-anchor={scrollAnchor ? 'true' : undefined}
      data-message-scroller-id={messageId}
      className={cn('min-w-0 shrink-0', className)}
      {...props}
    />
  )
)
MessageScrollerItem.displayName = 'MessageScrollerItem'

interface MessageScrollerButtonProps extends Omit<React.ComponentProps<typeof Button>, 'asChild'> {
  direction?: ScrollDirection
  render?: React.ReactElement
}

function MessageScrollerButton({
  direction = 'end',
  className,
  children,
  render,
  variant = 'secondary',
  size = 'icon-sm',
  onClick,
  ...props
}: MessageScrollerButtonProps) {
  const { scrollTo } = useMessageScroller()
  const active = useMessageScrollerVisibility(direction)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event)
    if (!event.defaultPrevented) {
      scrollTo(direction)
    }
  }

  const buttonProps = {
    type: 'button' as const,
    'data-slot': 'message-scroller-button',
    'data-direction': direction,
    'data-active': active ? 'true' : 'false',
    className: cn(
      'absolute left-1/2 z-10 -translate-x-1/2 border-border bg-background text-foreground shadow-md transition-[translate,scale,opacity] duration-200 hover:bg-muted hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[direction=end]:bottom-48 data-[direction=end]:data-[active=false]:translate-y-full data-[direction=start]:top-4 data-[direction=start]:data-[active=false]:-translate-y-full data-[direction=start]:[&_svg]:rotate-180',
      className
    ),
    onClick: handleClick,
    ...props,
  }

  const content = children ?? (
    <>
      <ChevronDown />
      <span className="sr-only">{direction === 'end' ? 'Scroll to end' : 'Scroll to start'}</span>
    </>
  )

  if (render) {
    return React.cloneElement(render, buttonProps, content)
  }

  return (
    <Button variant={variant} size={size} {...buttonProps}>
      {content}
    </Button>
  )
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}
