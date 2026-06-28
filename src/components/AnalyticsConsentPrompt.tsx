import { useEffect, useState, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AnalyticsState } from '@/electron/types'

function isUtilityRoute(): boolean {
  if (typeof window === 'undefined') return true
  return (
    window.location.hash.startsWith('#/about') ||
    window.location.hash.startsWith('#/chat-debug')
  )
}

export function AnalyticsConsentPrompt(): ReactElement | null {
  const [analyticsState, setAnalyticsState] = useState<AnalyticsState | null>(null)
  const [isResolving, setIsResolving] = useState(false)

  useEffect(() => {
    if (isUtilityRoute() || !window.analytics?.getState) return

    let cancelled = false
    void window.analytics
      .getState()
      .then((state) => {
        if (!cancelled) setAnalyticsState(state)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  if (!analyticsState || analyticsState.consentState !== 'undecided') {
    return null
  }

  const resolveConsent = async (enabled: boolean) => {
    if (isResolving) return
    setIsResolving(true)
    try {
      const nextState = await window.analytics.setEnabled(enabled)
      setAnalyticsState(nextState)
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent className="border-border bg-card sm:max-w-[520px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Share anonymous app stats?</DialogTitle>
          <DialogDescription>
            Help improve ZuraAI with basic usage and reliability events. Prompts, responses,
            file paths, API keys, clipboard data, and conversation content are never collected.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
          Analytics is off unless you choose to enable it. You can change this later in Settings.
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void resolveConsent(false)}
            disabled={isResolving}
          >
            Not now
          </Button>
          <Button
            type="button"
            onClick={() => void resolveConsent(true)}
            disabled={isResolving}
          >
            Enable anonymous analytics
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default AnalyticsConsentPrompt
