import { useEffect, useState } from 'react'

export const motionDurations = {
  micro: 0.12,
  fast: 0.16,
  normal: 0.22,
  slow: 0.32,
  deliberate: 0.36,
} as const

export const motionEasing = {
  standard: [0.22, 1, 0.36, 1] as const,
  emphasized: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
} as const

export const motionSpring = {
  snappy: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 30,
    mass: 0.9,
  },
  gentle: {
    type: 'spring' as const,
    stiffness: 360,
    damping: 28,
    mass: 0.9,
  },
  bouncy: {
    type: 'spring' as const,
    stiffness: 320,
    damping: 22,
    mass: 0.8,
  },
} as const

function getPrefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useMotionPreferences() {
  const [reducedMotion, setReducedMotion] = useState(getPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => {
      setReducedMotion(mediaQuery.matches)
    }

    handleChange()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  return {
    reducedMotion,
    animationsEnabled: !reducedMotion,
  }
}

export function maybeAnimate<T>(animationsEnabled: boolean, value: T): T | undefined {
  return animationsEnabled ? value : undefined
}

export function motionDuration(animationsEnabled: boolean, seconds: number) {
  return animationsEnabled ? seconds : 0
}

export function motionSpringTransition(
  animationsEnabled: boolean,
  spring: { type: 'spring'; stiffness: number; damping: number; mass: number } = motionSpring.bouncy
) {
  if (!animationsEnabled) {
    return { type: 'tween' as const, duration: 0 }
  }
  return spring
}
