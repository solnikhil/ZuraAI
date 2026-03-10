/**
 * AI Text Loading Component
 *
 * Displays animated text that morphs between states
 */

import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface AITextLoadingProps {
  text: string
  /**
   * Optional key to control when animation triggers.
   * If provided, animation only occurs when animationKey changes.
   * If not provided, animation occurs on every text change.
   */
  animationKey?: string
  className?: string
}

const textVariants = {
  initial: {
    opacity: 0,
    y: 8,
    scale: 0.96,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.96,
  },
}

export default function AITextLoading({ text, animationKey, className }: AITextLoadingProps) {
  // Use animationKey if provided, otherwise use text as key
  const key = animationKey ?? text

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={key}
        variants={textVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          duration: 0.2,
          ease: 'easeOut',
        }}
        className={cn('inline-block', className)}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  )
}
