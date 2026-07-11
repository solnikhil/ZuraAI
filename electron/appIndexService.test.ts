import { mkdtemp, writeFile } from 'fs/promises'
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

async function loadService(
  options: {
    nativeApps?: Array<{ name: string; appUserModelId: string }>
    userAssistEntries?: Array<{ name: string; usageCount?: number; lastUsedAt?: string }>
    runPowerShellError?: Error
    iconDelayMs?: number
    userDataPath?: string
  } = {}
) {
  userDataPath = options.userDataPath ?? (await mkdtemp(path.join(os.tmpdir(), 'zura-app-index-')))
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
    icon: ',0',
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
    if (script.includes('Explorer\\UserAssist') || script.includes('Decode-Rot13')) {
      return {
        stdout: (options.userAssistEntries ?? []).map((entry) => JSON.stringify(entry)).join('\n'),
        stderr: '',
      }
    }
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
      readShortcutLink: vi.fn(
        (shortcutPath: string) =>
          shortcutDetails.get(shortcutPath) ?? {
            target: `C:\\Apps\\${shortcutPath.split('\\').pop()?.replace('.lnk', '.exe')}`,
            cwd: 'C:\\Apps',
            args: '',
            icon: '',
            iconIndex: 0,
            appUserModelId: '',
            description: '',
          }
      ),
    },
  }))

  vi.doMock('fs/promises', async () => {
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
    const accessImplementation = vi.fn(async (filePath: string) => {
      if (
        filePath.includes('GitHub Copilot\\icons\\icon.ico') ||
        filePath.includes(
          'Microsoft VS Code\\stable\\resources\\app\\resources\\win32\\code.ico'
        ) ||
        filePath === 'C:\\Program Files\\paint.net\\paintdotnet.ico'
      ) {
        return undefined
      }
      return actual.access(filePath)
    })
    return {
      ...actual,
      default: {
        ...actual,
        access: accessImplementation,
        readdir: vi.fn(async (root: string, options?: unknown) => {
          if (root.includes('Nested')) return [fileEntry('Discord.lnk')]
          if (root === 'C:\\Users\\Nikhil\\Desktop')
            return [fileEntry('Kiro.lnk'), fileEntry('Claude.lnk')]
          if (root.includes('Start Menu\\Programs')) return [dirEntry('Nested')]
          return actual.readdir(root, options as never)
        }),
        readFile: vi.fn(async (filePath: string, options?: unknown) => {
          if (
            filePath ===
            'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.VisualElementsManifest.xml'
          ) {
            return '<Application><VisualElements Square70x70Logo="resources\\app\\resources\\win32\\code_70x70.png" Square150x150Logo="resources\\app\\resources\\win32\\code_150x150.png" /></Application>'
          }
          return actual.readFile(filePath, options as never)
        }),
      },
      access: accessImplementation,
      readdir: vi.fn(async (root: string, options?: unknown) => {
        if (root.includes('Nested')) return [fileEntry('Discord.lnk')]
        if (root === 'C:\\Users\\Nikhil\\Desktop')
          return [fileEntry('Kiro.lnk'), fileEntry('Claude.lnk')]
        if (root.includes('Start Menu\\Programs')) return [dirEntry('Nested')]
        return actual.readdir(root, options as never)
      }),
      readFile: vi.fn(async (filePath: string, options?: unknown) => {
        if (
          filePath ===
          'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.VisualElementsManifest.xml'
        ) {
          return '<Application><VisualElements Square70x70Logo="resources\\app\\resources\\win32\\code_70x70.png" Square150x150Logo="resources\\app\\resources\\win32\\code_150x150.png" /></Application>'
        }
        return actual.readFile(filePath, options as never)
      }),
    }
  })

  vi.doMock('./tools/native-common', async () => {
    const actual =
      await vi.importActual<typeof import('./tools/native-common')>('./tools/native-common')
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

function startAppsCallCount(runPowerShell: ReturnType<typeof vi.fn>): number {
  return runPowerShell.mock.calls.filter(([script]) => String(script).includes('Get-StartApps'))
    .length
}

describe('appIndexService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('refreshes, persists, and reloads a snapshot before rebuilding', async () => {
    const { service, runPowerShell } = await loadService()

    await service.refreshAppIndex()
    const apps = (await service.listApps()).apps
    expect(apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Kiro',
          appUserModelId: 'Kiro',
          shortcutPath: 'C:\\Users\\Nikhil\\Desktop\\Kiro.lnk',
          iconKey: expect.stringContaining('Kiro.exe'),
        }),
        expect.objectContaining({ name: 'Native Only', appUserModelId: 'Native.Only' }),
      ])
    )
    expect(apps.filter((app) => app.name === 'Kiro')).toHaveLength(1)
    expect(apps.filter((app) => app.name === 'Discord')).toHaveLength(1)

    vi.resetModules()
    const second = await import('./appIndexService')
    second.__resetAppIndexForTests()
    const listed = await second.listApps()

    expect(listed.apps).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Kiro' })]))
    expect(startAppsCallCount(runPowerShell)).toBe(1)
  })

  it('ranks exact, prefix, acronym, and substring matches', async () => {
    const { service } = await loadService()
    await service.refreshAppIndex()

    expect((await service.findApps('kiro')).matches[0]).toMatchObject({ name: 'Kiro' })
    expect((await service.findApps('disc')).matches[0]).toMatchObject({ name: 'Discord' })
    expect((await service.findApps('vsc')).matches[0]).toMatchObject({ name: 'Visual Studio Code' })
    expect((await service.findApps('claude')).matches[0]).toMatchObject({ name: 'Claude' })
  })

  it('ranks recently used apps first for the empty app list', async () => {
    const { service } = await loadService({
      nativeApps: [
        { name: 'Old App', appUserModelId: 'Old.App' },
        { name: 'Recent App', appUserModelId: 'Recent.App' },
      ],
      userAssistEntries: [
        {
          name: 'Recent App',
          usageCount: 4,
          lastUsedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          name: 'Old App',
          usageCount: 40,
          lastUsedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1_000).toISOString(),
        },
      ],
    })

    await service.refreshAppIndex()

    expect((await service.listApps()).apps[0]).toMatchObject({
      name: 'Recent App',
      lastUsedAt: expect.any(Number),
      usageCount: 4,
    })
  })

  it('keeps typed search relevance ahead of unrelated recent apps', async () => {
    const { service } = await loadService({
      nativeApps: [
        { name: 'Kiro', appUserModelId: 'Kiro' },
        { name: 'Recent App', appUserModelId: 'Recent.App' },
      ],
      userAssistEntries: [
        {
          name: 'Recent App',
          usageCount: 10,
          lastUsedAt: new Date().toISOString(),
        },
      ],
    })

    await service.refreshAppIndex()
    const matches = (await service.findApps('kiro')).matches

    expect(matches[0]).toMatchObject({ name: 'Kiro' })
    expect(matches).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Recent App' })])
    )
  })

  it('uses local command center launches as a recency signal', async () => {
    const { service } = await loadService({
      nativeApps: [
        { name: 'Old App', appUserModelId: 'Old.App' },
        { name: 'Launched App', appUserModelId: 'Launched.App' },
      ],
      userAssistEntries: [
        {
          name: 'Old App',
          usageCount: 8,
          lastUsedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
        },
      ],
    })

    await service.refreshAppIndex()
    const launched = (await service.findApps('launched')).matches[0]
    await service.recordAppLaunch(launched.id)

    expect((await service.listApps()).apps[0]).toMatchObject({ name: 'Launched App' })
  })

  it('ranks most frequently launched apps above a one-off recent open', async () => {
    const { service } = await loadService({
      nativeApps: [
        { name: 'Habit App', appUserModelId: 'Habit.App' },
        { name: 'One-Off App', appUserModelId: 'OneOff.App' },
      ],
      userAssistEntries: [
        {
          name: 'One-Off App',
          usageCount: 1,
          lastUsedAt: new Date(Date.now() - 30_000).toISOString(),
        },
      ],
    })

    await service.refreshAppIndex()
    const habit = (await service.findApps('habit')).matches[0]
    for (let i = 0; i < 8; i += 1) {
      await service.recordAppLaunch(habit.id)
    }

    expect((await service.listApps()).apps[0]).toMatchObject({ name: 'Habit App' })
  })

  it('does not use native AppUserModelIDs as icon paths', async () => {
    const { service } = await loadService({
      nativeApps: [{ name: 'Native Only', appUserModelId: 'Native.Only' }],
    })
    const fsPromises = await import('fs/promises')
    const emptyReaddir = vi.fn(async () => [])
    vi.mocked(fsPromises.readdir).mockImplementation(emptyReaddir)
    vi.mocked(fsPromises.default.readdir).mockImplementation(emptyReaddir)

    await service.refreshAppIndex()

    expect((await service.findApps('native')).matches[0]).toMatchObject({
      name: 'Native Only',
      appUserModelId: 'Native.Only',
      iconKey: undefined,
    })
  })

  it('dedupes apps that share the same AppUserModelID across shortcuts', async () => {
    const { service } = await loadService({
      nativeApps: [
        { name: 'Antigravity', appUserModelId: 'Antigravity.App' },
        { name: 'Antigravity IDE', appUserModelId: 'Antigravity.IDE' },
      ],
    })
    shortcutDetails.set('C:\\Users\\Nikhil\\Desktop\\Antigravity.lnk', {
      target: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe',
      cwd: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Antigravity',
      args: '',
      icon: '',
      iconIndex: 0,
      appUserModelId: 'Antigravity.App',
      description: '',
    })
    shortcutDetails.set(
      'C:\\Users\\Nikhil\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Antigravity.lnk',
      {
        target: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe',
        cwd: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Antigravity',
        args: '',
        icon: '',
        iconIndex: 0,
        appUserModelId: 'Antigravity.App',
        description: '',
      }
    )

    vi.mocked((await import('./tools/native-common')).runPowerShell).mockImplementation(
      async (_script: string) => {
        const apps = [
          { name: 'Antigravity', appUserModelId: 'Antigravity.App' },
          { name: 'Antigravity IDE', appUserModelId: 'Antigravity.IDE' },
        ]
        return {
          stdout: apps
            .map((app) => JSON.stringify({ name: app.name, appUserModelId: app.appUserModelId }))
            .join('\n'),
          stderr: '',
        }
      }
    )

    const readdir = (await import('fs/promises')).readdir as ReturnType<typeof vi.fn>
    readdir.mockImplementation(async (root: string) => {
      if (root === 'C:\\Users\\Nikhil\\Desktop') {
        return [fileEntry('Kiro.lnk'), fileEntry('Claude.lnk'), fileEntry('Antigravity.lnk')]
      }
      if (root.includes('Start Menu\\Programs') && !root.includes('Nested')) {
        return [dirEntry('Nested'), fileEntry('Antigravity.lnk')]
      }
      if (root.includes('Nested')) return [fileEntry('Discord.lnk')]
      return []
    })

    await service.refreshAppIndex()
    const antigravity = (await service.findApps('ant')).matches.filter((app) =>
      app.name.startsWith('Antigravity')
    )

    expect(antigravity).toHaveLength(2)
    expect(antigravity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Antigravity', appUserModelId: 'Antigravity.App' }),
        expect.objectContaining({ name: 'Antigravity IDE', appUserModelId: 'Antigravity.IDE' }),
      ])
    )
  })

  it('enriches native app rows from versioned shortcut names for better icon candidates', async () => {
    const { service } = await loadService({
      nativeApps: [{ name: 'Visual Studio', appUserModelId: 'VisualStudio.7c18beda' }],
    })
    shortcutDetails.set('C:\\Users\\Nikhil\\Desktop\\Visual Studio 2022.lnk', {
      target:
        'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe',
      cwd: 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE',
      args: '',
      icon: '',
      iconIndex: 0,
      appUserModelId: '',
      description: '',
    })
    const fsPromises = await import('fs/promises')
    const readdirImplementation = vi.fn(async (root: string) => {
      if (root === 'C:\\Users\\Nikhil\\Desktop') return [fileEntry('Visual Studio 2022.lnk')]
      return []
    })
    vi.mocked(fsPromises.readdir).mockImplementation(readdirImplementation)
    vi.mocked(fsPromises.default.readdir).mockImplementation(readdirImplementation)

    await service.refreshAppIndex()

    expect((await service.findApps('visual')).matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Visual Studio',
          appUserModelId: 'VisualStudio.7c18beda',
          shortcutPath: 'C:\\Users\\Nikhil\\Desktop\\Visual Studio 2022.lnk',
          targetPath:
            'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe',
          iconKey: expect.stringContaining('devenv.exe'),
        }),
      ])
    )
  })

  it('resolves app icons from the target executable', async () => {
    const { service } = await loadService({
      nativeApps: [{ name: 'GitHub Copilot', appUserModelId: 'com.github.githubapp' }],
    })
    shortcutDetails.set('C:\\Users\\Nikhil\\Desktop\\GitHub Copilot.lnk', {
      target: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\GitHub Copilot\\github.exe',
      cwd: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\GitHub Copilot',
      args: '',
      icon: ',0',
      iconIndex: 0,
      appUserModelId: '',
      description: '',
    })
    const fsPromises = await import('fs/promises')
    const readdirImplementation = vi.fn(async (root: string) => {
      if (root === 'C:\\Users\\Nikhil\\Desktop') return [fileEntry('GitHub Copilot.lnk')]
      return []
    })
    vi.mocked(fsPromises.readdir).mockImplementation(readdirImplementation)
    vi.mocked(fsPromises.default.readdir).mockImplementation(readdirImplementation)

    await service.refreshAppIndex()

    expect((await service.findApps('github')).matches[0]).toMatchObject({
      name: 'GitHub Copilot',
      appUserModelId: 'com.github.githubapp',
      shortcutPath: 'C:\\Users\\Nikhil\\Desktop\\GitHub Copilot.lnk',
      targetPath: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\GitHub Copilot\\github.exe',
      iconKey: expect.stringContaining('github.exe'),
    })
  })

  it('resolves the VS Code icon from its executable when the shortcut icon is empty', async () => {
    const { service } = await loadService({
      nativeApps: [{ name: 'Visual Studio Code', appUserModelId: 'Microsoft.VisualStudioCode' }],
    })
    shortcutDetails.set('C:\\Users\\Nikhil\\Desktop\\Visual Studio Code.lnk', {
      target: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      cwd: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Microsoft VS Code',
      args: '',
      icon: ',0',
      iconIndex: 0,
      appUserModelId: '',
      description: '',
    })
    const fsPromises = await import('fs/promises')
    const readdirImplementation = vi.fn(async (root: string) => {
      if (root === 'C:\\Users\\Nikhil\\Desktop') return [fileEntry('Visual Studio Code.lnk')]
      if (root === 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Microsoft VS Code')
        return [dirEntry('stable')]
      return []
    })
    vi.mocked(fsPromises.readdir).mockImplementation(readdirImplementation)
    vi.mocked(fsPromises.default.readdir).mockImplementation(readdirImplementation)

    await service.refreshAppIndex()

    expect((await service.findApps('vscode')).matches[0]).toMatchObject({
      name: 'Visual Studio Code',
      targetPath: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      iconKey: expect.stringContaining('Code.exe'),
    })
  })

  it('resolves the paint.net icon from its executable when the shortcut icon is empty', async () => {
    const { service } = await loadService({
      nativeApps: [{ name: 'paint.net', appUserModelId: 'paint.net' }],
    })
    shortcutDetails.set('C:\\Users\\Nikhil\\Desktop\\paint.net.lnk', {
      target: 'C:\\Program Files\\paint.net\\paintdotnet.exe',
      cwd: 'C:\\Program Files\\paint.net',
      args: '',
      icon: ',0',
      iconIndex: 0,
      appUserModelId: '',
      description: '',
    })
    const fsPromises = await import('fs/promises')
    const readdirImplementation = vi.fn(async (root: string) => {
      if (root === 'C:\\Users\\Nikhil\\Desktop') return [fileEntry('paint.net.lnk')]
      return []
    })
    vi.mocked(fsPromises.readdir).mockImplementation(readdirImplementation)
    vi.mocked(fsPromises.default.readdir).mockImplementation(readdirImplementation)

    await service.refreshAppIndex()

    expect((await service.findApps('paint')).matches[0]).toMatchObject({
      name: 'paint.net',
      targetPath: 'C:\\Program Files\\paint.net\\paintdotnet.exe',
      iconKey: expect.stringContaining('paintdotnet.exe'),
    })
  })

  it('resolves UWP app icons from the package logo asset', async () => {
    const { service } = await loadService({
      nativeApps: [
        { name: 'Notepad', appUserModelId: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' },
      ],
    })
    const runPowerShell = (await import('./tools/native-common')).runPowerShell as ReturnType<
      typeof vi.fn
    >
    runPowerShell.mockImplementation(async (script: string) => {
      if (script.includes('Get-AppxPackage')) {
        return {
          stdout: JSON.stringify({
            familyName: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe',
            logo: 'C:\\Program Files\\WindowsApps\\Notepad\\Assets\\NotepadAppList.scale-200.png',
          }),
          stderr: '',
        }
      }
      if (script.includes('UserAssist') || script.includes('Decode-Rot13')) {
        return { stdout: '', stderr: '' }
      }
      return {
        stdout: JSON.stringify({
          name: 'Notepad',
          appUserModelId: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
        }),
        stderr: '',
      }
    })
    const fsPromises = await import('fs/promises')
    const emptyReaddir = vi.fn(async () => [])
    vi.mocked(fsPromises.readdir).mockImplementation(emptyReaddir)
    vi.mocked(fsPromises.default.readdir).mockImplementation(emptyReaddir)

    await service.refreshAppIndex()

    expect((await service.findApps('notepad')).matches[0]).toMatchObject({
      name: 'Notepad',
      appUserModelId: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
      iconKey: expect.stringContaining('NotepadAppList.scale-200.png'),
    })
  })

  it('lists shortcut apps before the native refresh completes', async () => {
    const { service, runPowerShell } = await loadService()
    runPowerShell.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                stdout: JSON.stringify({ name: 'Native Only', appUserModelId: 'Native.Only' }),
                stderr: '',
              }),
            500
          )
        })
    )

    const startedAt = Date.now()
    const listed = await service.listApps()
    const elapsed = Date.now() - startedAt

    expect(elapsed).toBeLessThan(250)
    expect(listed.apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Kiro' }),
        expect.objectContaining({ name: 'Claude' }),
      ])
    )
  })

  it('keeps a stale snapshot available when refresh fails', async () => {
    const { service } = await loadService()
    await service.refreshAppIndex()

    vi.resetModules()
    const failed = await loadService({
      runPowerShellError: new Error('Get-StartApps failed'),
      userDataPath,
    })
    const diagnostics = await failed.service.refreshAppIndex()

    expect(diagnostics.ok).toBe(false)
    expect(diagnostics.stale).toBe(true)
    expect((await failed.service.listApps()).apps).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Kiro' })])
    )
  })

  it('merges duplicate native and shortcut rows from stale snapshots before rendering', async () => {
    const sameUserDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-app-index-snapshot-'))
    await writeFile(
      path.join(sameUserDataPath, 'command-center-app-index.json'),
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        sourceCounts: { 'windows-search': 1, desktop: 1 },
        apps: [
          {
            id: 'app:S2lybw',
            name: 'Kiro',
            normalizedName: 'kiro',
            aliases: ['Kiro'],
            source: 'windows-search',
            appUserModelId: 'Kiro',
            launchStrategy: 'appUserModelId',
            lastSeenAt: 1,
          },
          {
            id: 'app:QzpcVXNlcnNcTmlraGlsXERlc2t0b3BcS2lyby5sbms',
            name: 'Kiro',
            normalizedName: 'kiro',
            aliases: ['Kiro'],
            source: 'desktop',
            shortcutPath: 'C:\\Users\\Nikhil\\Desktop\\Kiro.lnk',
            targetPath: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
            launchStrategy: 'shortcutPath',
            lastSeenAt: 2,
          },
        ],
      })
    )

    const { service, runPowerShell } = await loadService({ userDataPath: sameUserDataPath })
    const apps = (await service.listApps()).apps
    const kiroRows = apps.filter((app) => app.name === 'Kiro')

    expect(kiroRows).toHaveLength(1)
    expect(kiroRows[0]).toMatchObject({
      shortcutPath: 'C:\\Users\\Nikhil\\Desktop\\Kiro.lnk',
      targetPath: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
      iconKey: expect.stringContaining('Kiro.exe'),
    })
    expect(runPowerShell).not.toHaveBeenCalled()
  })

  it('requests sanitized ndjson output for windows-search refresh', async () => {
    const { service, runPowerShell } = await loadService()
    await service.refreshAppIndex()
    const startAppsCall = runPowerShell.mock.calls.find(([script]) =>
      String(script).includes('Get-StartApps')
    )
    const script = String(startAppsCall?.[0] ?? '')
    expect(script).toContain('Remove-ControlChars')
    expect(script).toContain('ConvertTo-Json -Compress')
    expect(startAppsCall?.[1]).toMatchObject({
      maxOutputLength: 512_000,
    })
  })

  it('keeps partial app results when ndjson output is truncated', async () => {
    const { service } = await loadService()
    const runPowerShell = (await import('./tools/native-common')).runPowerShell as ReturnType<
      typeof vi.fn
    >
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
    expect((await service.listApps()).apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'First App', appUserModelId: 'First.App' }),
      ])
    )
  })

  it('shares concurrent refresh calls and bounds icon jobs', async () => {
    const { service, runPowerShell } = await loadService({ iconDelayMs: 20 })

    await Promise.all([
      service.refreshAppIndex(),
      service.refreshAppIndex(),
      service.refreshAppIndex(),
    ])
    expect(startAppsCallCount(runPowerShell)).toBe(1)

    const apps = (await service.listApps()).apps.slice(0, 8)
    apps.forEach((app) => service.getCachedAppIcon(app.iconKey))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(iconMaxActive).toBeLessThanOrEqual(4)
  })
})
