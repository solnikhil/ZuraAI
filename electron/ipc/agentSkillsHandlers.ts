import { trustedIpcMain as ipcMain } from './trustedIpc'

import {
  activateAgentSkill,
  installAgentSkill,
  listAgentSkills,
  searchAgentSkills,
  selectAgentSkillsProjectRoot,
  type AgentSkillsQuery,
} from '../agentSkills/service'
import type { AgentSkillScope } from '../../src/agentSkills/types'

function normalizeQuery(raw: unknown): AgentSkillsQuery {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const record = raw as Record<string, unknown>
  return {
    projectRoot: typeof record.projectRoot === 'string' ? record.projectRoot : undefined,
    disabledSkillNames: Array.isArray(record.disabledSkillNames)
      ? record.disabledSkillNames.filter((name): name is string => typeof name === 'string')
      : undefined,
  }
}

function normalizeTarget(raw: unknown): AgentSkillScope {
  return raw === 'project' ? 'project' : 'user'
}

export function registerAgentSkillsHandlers(): void {
  ipcMain.handle('agent-skills:list', (_event, query: unknown) =>
    listAgentSkills(normalizeQuery(query))
  )
  ipcMain.handle('agent-skills:activate', (_event, name: unknown) =>
    activateAgentSkill(typeof name === 'string' ? name : '')
  )
  ipcMain.handle('agent-skills:select-project-root', () => selectAgentSkillsProjectRoot())
  ipcMain.handle('agent-skills:clear-project-root', () => '')
  ipcMain.handle('agent-skills:search', (_event, query: unknown) =>
    searchAgentSkills(typeof query === 'string' ? query : '')
  )
  ipcMain.handle(
    'agent-skills:install',
    (_event, packageRef: unknown, target: unknown, projectRoot: unknown) =>
      installAgentSkill(
        typeof packageRef === 'string' ? packageRef : '',
        normalizeTarget(target),
        typeof projectRoot === 'string' ? projectRoot : undefined
      )
  )
}

export function unregisterAgentSkillsHandlers(): void {
  ipcMain.removeHandler('agent-skills:list')
  ipcMain.removeHandler('agent-skills:activate')
  ipcMain.removeHandler('agent-skills:select-project-root')
  ipcMain.removeHandler('agent-skills:clear-project-root')
  ipcMain.removeHandler('agent-skills:search')
  ipcMain.removeHandler('agent-skills:install')
}
