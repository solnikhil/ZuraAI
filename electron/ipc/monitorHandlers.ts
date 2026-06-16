import { ipcMain } from 'electron'
import {
  createScheduledTask,
  deleteScheduledTask,
  getMonitorRuntime,
  getRun,
  listScheduledTasks,
  listRuns,
  sanitizeScheduledTaskInput,
  updateScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskUpdateInput,
} from '../monitors'

function validateId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid ${label}`)
  }
  return value.trim()
}

export function registerMonitorHandlers(): void {
  ipcMain.handle('scheduled-tasks:list', async () => listScheduledTasks())

  ipcMain.handle('scheduled-tasks:create', async (_event, payload: unknown) => {
    const monitor = await createScheduledTask(sanitizeScheduledTaskInput(payload) as ScheduledTaskInput)
    await getMonitorRuntime()?.reschedule()
    return monitor
  })

  ipcMain.handle('scheduled-tasks:update', async (_event, id: unknown, patch: unknown) => {
    const monitor = await updateScheduledTask(
      validateId(id, 'monitor id'),
      sanitizeScheduledTaskInput(patch, true) as ScheduledTaskUpdateInput
    )
    await getMonitorRuntime()?.reschedule()
    return monitor
  })

  ipcMain.handle('scheduled-tasks:delete', async (_event, id: unknown) => {
    const deleted = await deleteScheduledTask(validateId(id, 'monitor id'))
    await getMonitorRuntime()?.reschedule()
    return deleted
  })

  ipcMain.handle('scheduled-tasks:run-now', async (_event, id: unknown) => {
    const runtime = getMonitorRuntime()
    if (!runtime) throw new Error('Monitor runtime is not available')
    return runtime.runNow(validateId(id, 'monitor id'))
  })

  ipcMain.handle('scheduled-tasks:list-runs', async (_event, taskId?: unknown) => {
    if (taskId === undefined || taskId === null || taskId === '') {
      return listRuns()
    }
    return listRuns(validateId(taskId, 'scheduled task id'))
  })

  ipcMain.handle('scheduled-tasks:get-run', async (_event, runId: unknown) => {
    return getRun(validateId(runId, 'run id'))
  })
}

export function unregisterMonitorHandlers(): void {
  ipcMain.removeHandler('scheduled-tasks:list')
  ipcMain.removeHandler('scheduled-tasks:create')
  ipcMain.removeHandler('scheduled-tasks:update')
  ipcMain.removeHandler('scheduled-tasks:delete')
  ipcMain.removeHandler('scheduled-tasks:run-now')
  ipcMain.removeHandler('scheduled-tasks:list-runs')
  ipcMain.removeHandler('scheduled-tasks:get-run')
}
