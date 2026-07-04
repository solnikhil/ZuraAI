import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { UsageSection } from './UsageSection'
import type { UsageStats } from './usageMetrics'

vi.mock('../ActivityGraph', () => ({
  ActivityGraph: () => <div data-testid="activity-graph" />,
}))

vi.mock('recharts', async () => {
  return {
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    Tooltip: () => <div data-testid="chart-tooltip" />,
    Legend: () => <div data-testid="chart-legend" />,
    PieChart: ({ children }: { children: ReactNode }) => (
      <div data-testid="model-mix-pie-chart">{children}</div>
    ),
    Pie: () => <div data-testid="model-mix-pie" />,
  }
})

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
  providerPerformanceByRange: {
    '1d': [],
    '7d': [],
    '30d': [],
    all: [],
  },
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
    render(<UsageSection stats={emptyStats} />)

    const toggle = await screen.findByRole('switch', { name: 'Enable anonymous analytics' })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(window.analytics.setEnabled).toHaveBeenCalledWith(true)
    })
  })

  it('renders activity graph first, then model mix', async () => {
    render(
      <UsageSection
        stats={{
          ...emptyStats,
          totalTokens: 1000,
          mostUsedModel: 'qwen3-max',
          modelEntries: [
            { name: 'qwen3-max', count: 4, tokens: 600 },
            { name: 'llama-3.3-70b', count: 2, tokens: 300 },
            { name: 'gpt-oss-120b', count: 1, tokens: 100 },
          ],
          topModelsByTokens: [
            { name: 'qwen3-max', count: 4, tokens: 600 },
            { name: 'llama-3.3-70b', count: 2, tokens: 300 },
            { name: 'gpt-oss-120b', count: 1, tokens: 100 },
          ],
        }}
      />
    )

    const modelMixRegion = await screen.findByRole('region', { name: 'Model Mix' })
    expect(within(modelMixRegion).getByRole('heading', { name: 'Model Mix' })).toBeInTheDocument()
    expect(within(modelMixRegion).getByText('Token share by model')).toBeInTheDocument()
    const usageRoot = screen.getByText('Usage Intelligence').closest('.settings-section-layout')
    const graph = screen.getByTestId('activity-graph')
    const modelMix = within(modelMixRegion).getByRole('heading', { name: 'Model Mix' })
    expect(usageRoot).not.toBeNull()
    expect(
      Array.from((usageRoot as HTMLElement).querySelectorAll('*')).indexOf(graph)
    ).toBeLessThan(Array.from((usageRoot as HTMLElement).querySelectorAll('*')).indexOf(modelMix))
    expect(screen.queryByText('Activity Streak')).not.toBeInTheDocument()
    expect(screen.queryByText('Model Details')).not.toBeInTheDocument()
  })

  it('filters response performance by range and provider', async () => {
    const groqSevenDay = {
      provider: 'groq' as const,
      messages: 5,
      tokens: 1000,
      inputTokens: 400,
      outputTokens: 600,
      cachedInputTokens: 0,
      cachedOutputTokens: 0,
      cacheWriteInputTokens: 0,
      cachedTotalTokens: 0,
      avgLatencyMs: 800,
      avgTtftMs: 120,
      avgTps: 44.5,
      errors: 1,
      estimatedCostUsd: 0.01,
    }
    const groqOneDay = {
      ...groqSevenDay,
      messages: 2,
      tokens: 300,
      inputTokens: 120,
      outputTokens: 180,
      avgLatencyMs: 700,
      avgTtftMs: 90,
      avgTps: 51.2,
      errors: 0,
      estimatedCostUsd: 0.003,
    }

    render(
      <UsageSection
        stats={{
          ...emptyStats,
          providerEntries: [groqSevenDay],
          providerPerformanceByRange: {
            '1d': [groqOneDay],
            '7d': [groqSevenDay],
            '30d': [],
            all: [groqSevenDay],
          },
        }}
      />
    )

    expect(screen.getByRole('heading', { name: 'Response Performance' })).toBeInTheDocument()
    expect(screen.getByText('800 ms')).toBeInTheDocument()
    expect(screen.getByText('44.5 tok/s')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '1D' }))
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'groq' } })

    expect(screen.getByText('700 ms')).toBeInTheDocument()
    expect(screen.getByText('51.2 tok/s')).toBeInTheDocument()
  })

  it('renders compact model mix empty state when there is no model usage', async () => {
    render(<UsageSection stats={emptyStats} />)

    const modelMixRegion = await screen.findByRole('region', { name: 'Model Mix' })
    expect(within(modelMixRegion).getByRole('heading', { name: 'Model Mix' })).toBeInTheDocument()
    expect(within(modelMixRegion).getByText('No model usage yet')).toBeInTheDocument()
  })
})
