import { useEffect, useMemo, useRef } from 'react'
import { motion, type ValueAnimationTransition } from 'framer-motion'

import { cn } from '@/lib/utils'

interface HoverLinkAnimationProps {
  children: React.ReactNode
  as?: React.ElementType
  className?: string
  effect?: ValueAnimationTransition
  highlightColor: string
  barThickness?: number
  gapRatio?: number
}

const HoverLinkAnimation = ({
  children,
  as: Tag = 'span',
  className,
  effect = { type: 'spring', stiffness: 260, damping: 24 },
  highlightColor,
  barThickness = 0.12,
  gapRatio = 0.03,
  ...rest
}: HoverLinkAnimationProps) => {
  const ref = useRef<HTMLSpanElement>(null)
  const textEase = [0.22, 1, 0.36, 1] as const

  const MotionTag = useMemo(() => motion.create(Tag), [Tag])

  useEffect(() => {
    const applyVars = () => {
      if (!ref.current) return

      const size = parseFloat(getComputedStyle(ref.current).fontSize)
      ref.current.style.setProperty('--hh-bar', `${size * barThickness}px`)
      ref.current.style.setProperty('--hh-gap', `${size * gapRatio}px`)
    }

    applyVars()
    window.addEventListener('resize', applyVars)
    return () => window.removeEventListener('resize', applyVars)
  }, [barThickness, gapRatio])

  const barAnim = {
    rest: { height: 'var(--hh-bar)' },
    hover: { height: '100%', transition: effect },
  }

  const textDuration =
    typeof effect === 'object' && 'duration' in effect && typeof effect.duration === 'number'
      ? effect.duration
      : 0.35

  const textBaseAnim = {
    rest: { opacity: 1 },
    hover: {
      opacity: [1, 1, 0],
      transition: {
        duration: textDuration,
        ease: textEase,
        times: [0, 0.5, 1],
      },
    },
  }

  const textHighlightAnim = {
    rest: { opacity: 0 },
    hover: {
      opacity: [0, 0, 1],
      transition: {
        duration: textDuration,
        ease: textEase,
        times: [0, 0.5, 1],
      },
    },
  }

  return (
    <MotionTag
      ref={ref}
      initial="rest"
      animate="rest"
      whileHover="hover"
      className={cn('relative inline-block cursor-pointer', className)}
      {...rest}
    >
      <motion.span
        aria-hidden="true"
        variants={barAnim}
        className="absolute w-full bg-current"
        style={{
          height: 'var(--hh-bar)',
          bottom: 'calc(-1 * var(--hh-gap))',
        }}
      />
      <motion.span variants={textBaseAnim} className="relative text-current">
        {children}
      </motion.span>
      <motion.span
        aria-hidden="true"
        variants={textHighlightAnim}
        className="pointer-events-none absolute inset-0"
        style={{ color: highlightColor }}
      >
        {children}
      </motion.span>
    </MotionTag>
  )
}

const Component = HoverLinkAnimation

export { Component, HoverLinkAnimation }
