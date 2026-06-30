import { mkdtemp } from 'fs/promises'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const shortcutDetails = new Map<string, Electron.ShortcutDetails>()
let userDataPath = ''
let iconActive = 0
let iconMaxActive = 0

function fileEntry(name: string) {
  return { name, isDirectory: () => false }
}

function dirEntry(name: string) {
  return { name, isDirectory: () => true }
}

async function loadService(options: {
  nativeApps?: Array<{ name: string; appUserModelId: string }>
  runPowerShellError?: Error
  iconDelayMs?: number
  userDataPath?: string
} = {}) {
  userDataPath = options.userDataPath ?? await mkdtemp(path.join(os.tmpdir(), 'zura-app-index-'))
  shortcutDetails.clear()
  iconActive = 0
  iconMaxActive = 0

  const nativeApps = options.nativeApps ?? [
    { name: 'Kiro', appUserModelId: 'Kiro' },
    { name: 'Discord', appUserModelId: 'com.squirrel.Discord.Discord' },
    { name: 'Discord', appUserModelId: 'com.squirrel.Discord.Discord' },
    { name: 'Native Only', appUserModelId: 'Native.Only' },
    { name: 'Visual Studio Code', appUserModelId: 'Microsoft.VisualStudioCode' },
  ]

  shortcutDetails.set('C:\\Users\\Nikhil\\Desktop\\Kiro.lnk', {
    target: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
    cwd: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro',
    args: '',
    icon: '',
    iconIndex: 0,
    appUserModelId: '',
    description: '',
  })
  shortcutDetails.set('C:\\Users\\Nikhil\\Desktop\\Claude.lnk', {
    target: 'C:\\Users\\Nikhil\\AppData\\Local\\AnthropicClaude\\claude.exe',
    cwd: 'C:\\Users\\Nikhil\\AppData\\Local\\AnthropicClaude',
    args: '',
    icon: 'C:\\Users\\Nikhil\\AppData\\Local\\AnthropicClaude\\claude.exe',
    iconIndex: 0,
    appUserModelId: '',
    description: '',
  })

  const runPowerShell = vi.fn(async (script: string) => {
    if (options.runPowerShellError) throw options.runPowerShellError
    const queryMatch = script.match(/Get-StartApps -Name '\*([^']+)\*'/)
    const query = queryMatch?.[1].toLowerCase()
    const apps = query
      ? nativeApps.filter((app) => app.name.toLowerCase().includes(query))
      : nativeApps
    if (query && apps.length === 0) return { stdout: '', stderr: '' }
    return {
      stdout: apps
        .map((app) => JSON.stringify({ name: app.name, appUserModelId: app.appUserModelId }))
        .join('\n'),
      stderr: '',
    }
  })

  vi.doMock('os', () => ({
    default: { homedir: () => 'C:\\Users\\Nikhil', tmpdir: os.tmpdir },
    homedir: () => 'C:\\Users\\Nikhil',
    tmpdir: os.tmpdir,
  }))

  vi.doMock('electron', () => ({
    app: {
      getPath: vi.fn(() => userDataPath),
      getFileIcon: vi.fn(async () => {
        iconActive += 1
        iconMaxActive = Math.max(iconMaxActive, iconActive)
        await new Promise((resolve) => setTimeout(resolve, options.iconDelayMs ?? 0))
        iconActive -= 1
        return {
          isEmpty: () => false,
          toDataURL: () => 'data:image/png;base64,icon',
        }
      }),
    },
    shell: {
      readShortcutLink: vi.fn((shortcutPath: string) => shortcutDetails.get(shortcutPath) ?? {
        target: `C:\\Apps\\${shortcutPath.split('\\').pop()?.replace('.lnk', '.exe')}`,
        cwd: 'C:\\Apps',
        args: '',
        icon: '',
        iconIndex: 0,
        appUserModelId: '',
        description: '',
      }),
    },
  }))

  vi.doMock('fs/promises', async () => {
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
    return {
      ...actual,
      default: {
        ...actual,
        readdir: vi.fn(async (root: string, options?: unknown) => {
          if (root.includes('Nested')) return [fileEntry('Discord.lnk')]
          if (root === 'C:\\Users\\Nikhil\\Desktop') return [fileEntry('Kiro.lnk'), fileEntry('Claude.lnk')]
          if (root.includes('Start Menu\\Programs')) return [dirEntry('Nested')]
          return actual.readdir(root, options as never)
        }),
      },
      readdir: vi.fn(async (root: string, options?: unknown) => {
        if (root.includes('Nested')) return [fileEntry('Discord.lnk')]
        if (root === 'C:\\Users\\Nikhil\\Desktop') return [fileEntry('Kiro.lnk'), fileEntry('Claude.lnk')]
        if (root.includes('Start Menu\\Programs')) return [dirEntry('Nested')]
        return actual.readdir(root, options as never)
      }),
    }
  })

  vi.doMock('./tools/native-common', async () => {
    const actual = await vi.importActual<typeof import('./tools/native-common')>('./tools/native-common')
    return {
      ...actual,
      isWindows: () => true,
      runPowerShell,
    }
  })

  const service = await import('./appIndexService')
  service.__resetAppIndexForTests()
  return { service, runPowerShell }
}

describe('appIndexService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('refreshes, persists, and reloads a snapshot before rebuilding', async () => {
    const { service, runPowerShell } = await loadService()

    await service.refreshAppIndex()
    expect((await service.listApps()).apps).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Kiro', appUserModelId: 'Kiro', shortcutPath: 'C:\\Users\\Nikhil\\Desktop\\Kiro.lnk' }),
      expect.objectContaining({ name: 'Native Only', appUserModelId: 'Native.Only' }),
    ]))

    vi.resetModules()
    const second = await import('./appIndexService')
    second.__resetAppIndexForTests()
    const listed = await second.listApps()

    expect(listed.apps).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Kiro' })]))
    expect(runPowerShell).toHaveBeenCalledTimes(1)
  })

  it('ranks exact, prefix, acronym, and substring matches', async () => {
    const { service } = await loadService()
    await service.refreshAppIndex()

    expect((await service.findApps('kiro')).matches[0]).toMatchObject({ name: 'Kiro' })
    expect((await service.findApps('disc')).matches[0]).toMatchObject({ name: 'Discord' })
    expect((await service.findApps('vsc')).matches[0]).toMatchObject({ name: 'Visual Studio Code' })
    expect((await service.findApps('claude')).matches[0]).toMatchObject({ name: 'Claude' })
  })

  it('lists shortcut apps before the native refresh completes', async () => {
    const { service, runPowerShell } = await loadService()
    runPowerShell.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({
        stdout: JSON.stringify({ name: 'Native Only', appUserModelId: 'Native.Only' }),
        stderr: '',
      }), 500)
    }))

    const startedAt = Date.now()
    const listed = await service.listApps()
    const elapsed = Date.now() - startedAt

    expect(elapsed).toBeLessThan(250)
    expect(listed.apps).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Kiro' }),
      expect.objectContaining({ name: 'Claude' }),
    ]))
  })

  it('keeps a stale snapshot available when refresh fails', async () => {
    const { service } = await loadService()
    await service.refreshAppIndex()

    vi.resetModules()
    const failed = await loadService({ runPowerShellError: new Error('Get-StartApps failed'), userDataPath })
    const diagnostics = await failed.service.refreshAppIndex()

    expect(diagnostics.ok).toBe(false)
    expect(diagnostics.stale).toBe(true)
    expect((await failed.service.listApps()).apps).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Kiro' })]))
  })

  it('requests sanitized ndjson output for windows-search refresh', async () => {
    const { service, runPowerShell } = await loadService()
    await service.refreshAppIndex()
    const script = String(runPowerShell.mock.calls[0]?.[0] ?? '')
    expect(script).toContain('Remove-ControlChars')
    expect(script).toContain('ConvertTo-Json -Compress')
    expect(runPowerShell.mock.calls[0]?.[1]).toMatchObject({
      maxOutputLength: 512_000,
    })
  })

  it('keeps partial app results when ndjson output is truncated', async () => {
    const { service } = await loadService()
    const runPowerShell = (await import('./tools/native-common')).runPowerShell as ReturnType<typeof vi.fn>
    runPowerShell.mockResolvedValueOnce({
      stdout: [
        '{"name":"First App","appUserModelId":"First.App"}',
        '{"name":"Broken App","appUserModelId":"Bro',
        '...[truncated]',
      ].join('\n'),
      stderr: '',
    })

    const diagnostics = await service.refreshAppIndex()

    expect(diagnostics.ok).toBe(true)
    expect((await service.listApps()).apps).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'First App', appUserModelId: 'First.App' }),
    ]))
  })

  it('shares concurrent refresh calls and bounds icon jobs', async () => {
    const { service, runPowerShell } = await loadService({ iconDelayMs: 20 })

    await Promise.all([service.refreshAppIndex(), service.refreshAppIndex(), service.refreshAppIndex()])
    expect(runPowerShell).toHaveBeenCalledTimes(1)

    const apps = (await service.listApps()).apps.slice(0, 8)
    apps.forEach((app) => service.getCachedAppIcon(app.iconKey))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(iconMaxActive).toBeLessThanOrEqual(4)
  })
})
