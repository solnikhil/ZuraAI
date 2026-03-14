import { app } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'

import type {
  WebsiteSmokeTestArtifacts,
  WebsiteSmokeTestRunRecord,
  WebsiteSmokeTestStepLogEntry,
} from '../../src/testing/types'

const TESTING_RUNS_DIRNAME = 'testing-runs'
const STEP_LOG_FILENAME = 'step-log.json'
const METADATA_FILENAME = 'metadata.json'
const SUMMARY_FILENAME = 'summary.txt'

export interface TestingRunArtifactStore {
  runId: string
  runDirectoryPath: string
  artifacts: WebsiteSmokeTestArtifacts
  getStepScreenshotPath: (stepIndex: number) => string
  getFinalScreenshotPath: () => string
  getFailureScreenshotPath: () => string
  getTracePath: () => string
  writeStepLog: (entries: WebsiteSmokeTestStepLogEntry[]) => Promise<void>
  writeSummary: (summary: string) => Promise<void>
  writeMetadata: (record: WebsiteSmokeTestRunRecord) => Promise<void>
}

export function getTestingRunsBasePath(): string {
  return path.join(app.getPath('userData'), TESTING_RUNS_DIRNAME)
}

function buildRunDirectoryPath(runId: string): string {
  return path.join(getTestingRunsBasePath(), runId)
}

export function isValidTestingRunId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{8,}$/.test(value)
}

export async function createTestingRunArtifactStore(): Promise<TestingRunArtifactStore> {
  const runId = randomUUID()
  const runDirectoryPath = buildRunDirectoryPath(runId)

  await fs.mkdir(runDirectoryPath, { recursive: true })

  const artifacts: WebsiteSmokeTestArtifacts = {
    runId,
    runDirectoryPath,
    metadataPath: path.join(runDirectoryPath, METADATA_FILENAME),
    stepLogPath: path.join(runDirectoryPath, STEP_LOG_FILENAME),
  }

  return {
    runId,
    runDirectoryPath,
    artifacts,
    getStepScreenshotPath: (stepIndex: number) =>
      path.join(runDirectoryPath, `step-${String(stepIndex + 1).padStart(2, '0')}.png`),
    getFinalScreenshotPath: () => path.join(runDirectoryPath, 'final.png'),
    getFailureScreenshotPath: () => path.join(runDirectoryPath, 'failure.png'),
    getTracePath: () => path.join(runDirectoryPath, 'trace.zip'),
    writeStepLog: async (entries: WebsiteSmokeTestStepLogEntry[]) => {
      await fs.writeFile(artifacts.stepLogPath!, JSON.stringify(entries, null, 2), 'utf-8')
    },
    writeSummary: async (summary: string) => {
      await fs.writeFile(path.join(runDirectoryPath, SUMMARY_FILENAME), summary, 'utf-8')
    },
    writeMetadata: async (record: WebsiteSmokeTestRunRecord) => {
      await fs.writeFile(artifacts.metadataPath!, JSON.stringify(record, null, 2), 'utf-8')
    },
  }
}

export async function readTestingRunMetadata(runId: string): Promise<WebsiteSmokeTestRunRecord | null> {
  if (!isValidTestingRunId(runId)) {
    return null
  }

  try {
    const metadataPath = path.join(buildRunDirectoryPath(runId), METADATA_FILENAME)
    const raw = await fs.readFile(metadataPath, 'utf-8')
    return JSON.parse(raw) as WebsiteSmokeTestRunRecord
  } catch {
    return null
  }
}
