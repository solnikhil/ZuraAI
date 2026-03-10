import { useReducedMotion } from 'framer-motion'

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
} as const

export function useMotionPreferences() {
  const reducedMotion = useReducedMotion()

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
