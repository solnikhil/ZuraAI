import { useEffect } from 'react'

import { useSettings } from '@/contexts/SettingsContext'
import { generateTitleTextForModel } from '@/providers/providerRuntime'
import type { ScheduledTaskSummaryRequest } from '@/electron/types'

function buildScheduledTaskSummaryPrompt(request: ScheduledTaskSummaryRequest): string {
  const instructions = request.instructions.trim()
    ? request.instructions.trim()
    : 'Focus on meaningful content changes. Ignore formatting, navigation, footer, cookie, and timestamp-only noise.'

  return [
    'Summarize this scheduled lookout change for an in-app inbox.',
    '',
    `Task: ${request.taskTitle}`,
    `User instructions: ${instructions}`,
    '',
    'Requirements:',
    '- Be concise: 3-6 bullets maximum.',
    '- Identify what changed and why it matters.',
    '- Include the affected URL when useful.',
    '- If the change appears minor/noisy, say that clearly.',
    '',
    'Detected changes:',
    request.diffSummary,
  ].join('\n')
}

export function MonitorSummarySync(): null {
  const { settings } = useSettings()

  useEffect(() => {
    if (!window.scheduledTasks?.onSummaryRequest) return undefined

    return window.scheduledTasks.onSummaryRequest((request) => {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 40_000)

      void generateTitleTextForModel(
        settings,
        settings.aiModel,
        buildScheduledTaskSummaryPrompt(request),
        {
          maxTokens: 500,
          signal: controller.signal,
        }
      )
        .then((summary) =>
          window.scheduledTasks.resolveSummary({
            requestId: request.requestId,
            summary,
          })
        )
        .catch((error) =>
          window.scheduledTasks.resolveSummary({
            requestId: request.requestId,
            error: error instanceof Error ? error.message : String(error),
          })
        )
        .finally(() => window.clearTimeout(timeout))
    })
  }, [settings])

  return null
}

export default MonitorSummarySync
