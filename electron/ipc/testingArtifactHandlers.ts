import { ipcMain, shell } from 'electron'

import { readTestingRunMetadata } from '../testing/artifactStore'

async function openPathIfPresent(targetPath: string | undefined): Promise<boolean> {
  if (!targetPath) {
    return false
  }

  const error = await shell.openPath(targetPath)
  return error.length === 0
}

export function registerTestingArtifactHandlers(): void {
  ipcMain.handle('testing-artifacts:open-run-folder', async (_event, runId: unknown) => {
    if (typeof runId !== 'string') {
      return false
    }

    const metadata = await readTestingRunMetadata(runId)
    return openPathIfPresent(metadata?.result.artifacts.runDirectoryPath)
  })

  ipcMain.handle('testing-artifacts:open-trace', async (_event, runId: unknown) => {
    if (typeof runId !== 'string') {
      return false
    }

    const metadata = await readTestingRunMetadata(runId)
    return openPathIfPresent(metadata?.result.artifacts.tracePath)
  })
}

export function unregisterTestingArtifactHandlers(): void {
  ipcMain.removeHandler('testing-artifacts:open-run-folder')
  ipcMain.removeHandler('testing-artifacts:open-trace')
}
