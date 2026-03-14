import React from 'react'

import { AlertTriangle, CheckCircle, FlaskConical, FolderOpen, Image, Search } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { WebsiteSmokeTestResult } from '@/testing/types'

function toFileAssetSrc(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined
  if (filePath.startsWith('file://')) return filePath

  const normalized = filePath.replace(/\\/g, '/')
  return encodeURI(normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`)
}

function getStatusVariant(status: WebsiteSmokeTestResult['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'passed':
      return 'default'
    case 'partial':
      return 'secondary'
    case 'failed':
      return 'destructive'
  }
}

function getPreviewPath(result: WebsiteSmokeTestResult): string | undefined {
  return result.artifacts.failureScreenshotPath || result.artifacts.finalScreenshotPath
}

export interface WebsiteSmokeTestResultCardProps {
  result: WebsiteSmokeTestResult
  className?: string
}

export function WebsiteSmokeTestResultCard({
  result,
  className,
}: WebsiteSmokeTestResultCardProps): React.ReactElement {
  const previewSrc = toFileAssetSrc(getPreviewPath(result))
  const runId = result.artifacts.runId
  const hasTrace = Boolean(result.artifacts.tracePath)

  const handleOpenRunFolder = React.useCallback(() => {
    if (!runId || !window.testingArtifacts) return
    void window.testingArtifacts.openRunFolder(runId)
  }, [runId])

  const handleOpenTrace = React.useCallback(() => {
    if (!runId || !window.testingArtifacts) return
    void window.testingArtifacts.openTrace(runId)
  }, [runId])

  return (
    <Card className={className ? `p-4 ${className}` : 'p-4'}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FlaskConical size={16} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Website Smoke Test</div>
              <div className="truncate text-xs text-muted-foreground">{result.targetUrl}</div>
            </div>
          </div>

          <Badge variant={getStatusVariant(result.status)}>{result.status}</Badge>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="font-medium">Goal:</span> {result.goal}
          </div>
          <div>
            <span className="font-medium">Steps:</span> {result.completedSteps}/{result.totalSteps}
          </div>
          {result.failedStepIndex != null && (
            <div className="sm:col-span-2">
              <span className="font-medium">Failed step:</span> {result.failedStepIndex + 1}
              {result.failedStepReason ? ` - ${result.failedStepReason}` : ''}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm leading-6">
          {result.summary}
        </div>

        {result.assertionResults.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Assertions
            </div>
            <div className="flex flex-col gap-2">
              {result.assertionResults.map((item, index) => (
                <div
                  key={`${item.assertion.type}-${index}`}
                  className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                >
                  {item.status === 'passed' ? (
                    <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                  ) : item.status === 'failed' ? (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  ) : (
                    <Search size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium">{item.assertion.type}</div>
                    <div className="text-muted-foreground">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {previewSrc && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Image size={14} /> Screenshot Preview
            </div>
            <div className="overflow-hidden rounded-xl border border-border/70 bg-black/70">
              <img
                src={previewSrc}
                alt="Smoke test screenshot preview"
                className="max-h-[320px] w-full object-contain"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleOpenRunFolder} disabled={!runId}>
            <FolderOpen size={14} />
            Open Artifact Folder
          </Button>
          <Button size="sm" variant="outline" onClick={handleOpenTrace} disabled={!runId || !hasTrace}>
            <Search size={14} />
            Open Trace
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default WebsiteSmokeTestResultCard
