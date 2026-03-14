import React from 'react'

import { FlaskConical, Loader2, Play, ShieldCheck } from '@/components/icons'
import WebsiteSmokeTestResultCard from '@/components/testing/WebsiteSmokeTestResultCard'
import { useToast } from '@/components/shared/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import { executeTool } from '@/tools/executor'
import type {
  TargetRef,
  WebsiteSmokeTestProposalResult,
  WebsiteSmokeTestResult,
} from '@/testing/types'

function formatTargetRef(target: TargetRef): string {
  return `${target.by}:${target.value}`
}

function collectProposalAssumptions(
  proposal: WebsiteSmokeTestProposalResult['proposal']
): string[] {
  const assumptions: string[] = []
  const seen = new Set<string>()

  const push = (value: string) => {
    if (!seen.has(value)) {
      seen.add(value)
      assumptions.push(value)
    }
  }

  proposal.steps.forEach((step) => {
    if ('target' in step) {
      push(formatTargetRef(step.target))
    }
  })

  ;(proposal.assertions || []).forEach((assertion) => {
    if ('target' in assertion) {
      push(formatTargetRef(assertion.target))
    }
  })

  return assumptions.slice(0, 4)
}

function formatStepLine(step: WebsiteSmokeTestProposalResult['proposal']['steps'][number]): string {
  switch (step.type) {
    case 'goto':
      return `Go to ${step.url || 'the target URL'}`
    case 'click':
      return `Click ${step.target.by}:${step.target.value}`
    case 'fill':
      return `Fill ${step.target.by}:${step.target.value} with ${JSON.stringify(step.value)}`
    case 'press':
      return `Press ${step.key}`
    case 'select':
      return `Select ${JSON.stringify(step.value)} in ${step.target.by}:${step.target.value}`
    case 'waitForText':
      return `Wait for text ${JSON.stringify(step.text)}`
    case 'waitForElement':
      return `Wait for ${step.target.by}:${step.target.value}`
  }
}

function formatAssertionLine(
  assertion: NonNullable<WebsiteSmokeTestProposalResult['proposal']['assertions']>[number]
): string {
  switch (assertion.type) {
    case 'textVisible':
      return `Text visible: ${assertion.text}`
    case 'elementVisible':
      return `Element visible: ${assertion.target.by}:${assertion.target.value}`
    case 'elementEnabled':
      return `Element enabled: ${assertion.target.by}:${assertion.target.value}`
    case 'urlContains':
      return `URL contains: ${assertion.value}`
    case 'urlEquals':
      return `URL equals: ${assertion.value}`
    case 'titleContains':
      return `Title contains: ${assertion.value}`
  }
}

export interface WebsiteSmokeTestProposalCardProps {
  proposalResult: WebsiteSmokeTestProposalResult
  sessionId?: string
  messageId?: string
  toolResultIndex?: number
}

export function WebsiteSmokeTestProposalCard({
  proposalResult,
  sessionId,
  messageId,
  toolResultIndex,
}: WebsiteSmokeTestProposalCardProps): React.ReactElement {
  const { showToast } = useToast()
  const { sessions, updateStreamingMessage } = useChatHistory()
  const [isRunning, setIsRunning] = React.useState(false)
  const proposalAssumptions = React.useMemo(
    () => collectProposalAssumptions(proposalResult.proposal),
    [proposalResult.proposal]
  )

  const persistProposalResult = React.useCallback(
    (nextResult: WebsiteSmokeTestProposalResult) => {
      if (!sessionId || !messageId || toolResultIndex == null) {
        return
      }

      const session = sessions.find((entry) => entry.id === sessionId)
      const message = session?.messages.find((entry) => entry.id === messageId)
      const toolResults = message?.toolResults
      if (!toolResults) {
        return
      }

      const nextToolResults = toolResults.map((item, index) =>
        index === toolResultIndex
          ? {
              ...item,
              result: {
                ...item.result,
                success: true,
                data: nextResult,
              },
            }
          : item
      )

      updateStreamingMessage(sessionId, messageId, { toolResults: nextToolResults })
    },
    [messageId, sessionId, sessions, toolResultIndex, updateStreamingMessage]
  )

  const handleApproveAndRun = React.useCallback(async () => {
    if (isRunning) {
      return
    }

    const runningState: WebsiteSmokeTestProposalResult = {
      ...proposalResult,
      status: 'running',
      executionError: undefined,
    }

    setIsRunning(true)
    persistProposalResult(runningState)

    try {
      const execution = await executeTool(
        'run_website_smoke_test',
        proposalResult.proposal as unknown as Record<string, unknown>
      )

      if (!execution.success) {
        const failedState: WebsiteSmokeTestProposalResult = {
          ...proposalResult,
          status: 'execution_failed',
          executionError: execution.error || 'Smoke test execution failed.',
        }
        persistProposalResult(failedState)
        showToast(failedState.executionError || 'Smoke test execution failed.', 'error')
        return
      }

      const completedState: WebsiteSmokeTestProposalResult = {
        ...proposalResult,
        status: 'completed',
        executionResult: execution.data as WebsiteSmokeTestResult,
        executionError: undefined,
      }
      persistProposalResult(completedState)
      showToast('Website smoke test completed.', 'success')
    } finally {
      setIsRunning(false)
    }
  }, [isRunning, persistProposalResult, proposalResult, showToast])

  if (proposalResult.status === 'completed' && proposalResult.executionResult) {
    return <WebsiteSmokeTestResultCard result={proposalResult.executionResult} />
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={16} />
            Website Smoke Test Proposal
          </div>
          <Badge variant={proposalResult.status === 'execution_failed' ? 'destructive' : 'secondary'}>
            {proposalResult.status === 'awaiting_approval'
              ? 'Awaiting Approval'
              : proposalResult.status === 'running'
                ? 'Running'
                : proposalResult.status === 'execution_failed'
                  ? 'Run Failed'
                  : 'Completed'}
          </Badge>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm leading-6">
          {proposalResult.summary}
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="font-medium">Goal:</span> {proposalResult.proposal.goal}
          </div>
          <div>
            <span className="font-medium">URL:</span> {proposalResult.proposal.url}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border/70 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Planned Steps
            </div>
            <div className="space-y-2 text-sm">
              {proposalResult.proposal.steps.map((step, index) => (
                <div key={`${step.type}-${index}`} className="rounded-md bg-muted/30 px-3 py-2">
                  <span className="font-medium">{index + 1}.</span> {formatStepLine(step)}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Visible Assertions
            </div>
            <div className="space-y-2 text-sm">
              {(proposalResult.proposal.assertions || []).length > 0 ? (
                proposalResult.proposal.assertions!.map((assertion, index) => (
                  <div key={`${assertion.type}-${index}`} className="rounded-md bg-muted/30 px-3 py-2">
                    <span className="font-medium">{index + 1}.</span> {formatAssertionLine(assertion)}
                  </div>
                ))
              ) : (
                <div className="rounded-md bg-muted/30 px-3 py-2 text-muted-foreground">
                  No assertions were proposed.
                </div>
              )}
            </div>
          </div>
        </div>

        {proposalResult.executionError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {proposalResult.executionError}
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
          <div className="font-medium text-foreground">Before I run it:</div>
          <div>
            Review the URL, steps, and assertions above. If anything should change, reply with the tweak and I will update the proposal.
          </div>
          {proposalAssumptions.length > 0 && (
            <div>
              I am currently assuming the page is targetable with{' '}
              {proposalAssumptions.map((assumption, index) => (
                <React.Fragment key={assumption}>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">{assumption}</code>
                  {index < proposalAssumptions.length - 1 ? ', ' : '.'}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleApproveAndRun}
            disabled={isRunning || proposalResult.status === 'running'}
          >
            {isRunning || proposalResult.status === 'running' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}
            {proposalResult.status === 'execution_failed' ? 'Retry Approved Test' : 'Approve And Run'}
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FlaskConical size={14} />
            The browser run starts only after approval.
          </div>
        </div>
      </div>
    </Card>
  )
}

export default WebsiteSmokeTestProposalCard
