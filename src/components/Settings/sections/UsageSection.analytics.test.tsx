import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UsageSection } from './UsageSection'
import type { UsageStats } from './usageMetrics'

vi.mock('../ActivityGraph', () => ({
  ActivityGraph: () => <div data-testid="activity-graph" />,
}))

const emptyStats: UsageStats = {
  totalSessions: 0,
  totalMessages: 0,
  userMessages: 0,
  assistantMessages: 0,
  todayMessages: 0,
  avgMessagesPerSession: 0,
  totalTokens: 0,
  cachedInputTokens: 0,
  cachedOutputTokens: 0,
  avgTokensPerAssistant: 0,
  tokensLast7Days: 0,
  tokensLast30Days: 0,
  cachedTotalTokens: 0,
  cacheWriteInputTokens: 0,
  imagesProcessed: 0,
  avgAssistantLatencyMs: 0,
  avgAssistantTtftMs: 0,
  avgAssistantTps: 0,
  currentActiveStreak: 0,
  longestActiveStreak: 0,
  activeDays: 0,
  mostUsedModel: 'N/A',
  modelEntries: [],
  topModelsByTokens: [],
  providerEntries: [],
  estimatedSpendUsd: 0,
  spendCoveragePercent: 0,
  totalToolCalls: 0,
  totalRegenerations: 0,
  assistantErrorRate: 0,
  assistantMessagesWithErrors: 0,
  totalWebSearches: 0,
  successfulWebSearches: 0,
  failedWebSearches: 0,
  webSearchSuccessRate: 0,
  avgWebSearchExecutionMs: 0,
  topSearchQueries: [],
  errorBreakdown: {
    network: 0,
    auth: 0,
    rateLimit: 0,
    provider: 0,
    tool: 0,
    other: 0,
  },
  activityData: [],
}

describe('UsageSection analytics settings', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'analytics', {
      configurable: true,
      value: {
        getState: vi.fn(async () => ({
          analyticsEnabled: false,
          anonymousInstallId: 'install-1',
          firstLaunchSent: false,
          lastSeenVersion: '',
          consentState: 'declined',
          hasProjectKey: true,
        })),
        setEnabled: vi.fn(async (enabled: boolean) => ({
          analyticsEnabled: enabled,
          anonymousInstallId: 'install-1',
          firstLaunchSent: enabled,
          lastSeenVersion: '',
          consentState: enabled ? 'accepted' : 'declined',
          hasProjectKey: true,
        })),
        track: vi.fn(),
      },
    })
  })

  it('toggles anonymous analytics through the dedicated bridge', async () => {
    render(
      <UsageSection
        stats={emptyStats}
        onExportSnapshot={vi.fn()}
        onExportWebSearchCsv={vi.fn()}
      />
    )

    const toggle = await screen.findByRole('switch', { name: 'Enable anonymous analytics' })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(window.analytics.setEnabled).toHaveBeenCalledWith(true)
    })
  })
})
