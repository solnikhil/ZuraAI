import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'fs/promises'
import crypto from 'crypto'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let userData = ''
let selectedDevelopmentRoot = ''
let developmentWatchCallback: (() => void) | undefined

async function loadService() {
  userData = await mkdtemp(path.join(os.tmpdir(), 'zura-extensions-'))
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  vi.doMock('electron', () => ({
    app: { isPackaged: false, getPath: () => userData, getAppPath: () => process.cwd() },
    BrowserWindow: { getAllWindows: () => [], fromWebContents: () => undefined },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: !selectedDevelopmentRoot, filePaths: selectedDevelopmentRoot ? [selectedDevelopmentRoot] : [] })), showMessageBox: vi.fn(async () => ({ response: 1 })) },
    ipcMain: { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)), removeHandler: vi.fn((channel: string) => handlers.delete(channel)) },
  }))
  vi.doMock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs')
    return { ...actual, watch: vi.fn((_root: string, _options: unknown, callback: () => void) => { developmentWatchCallback = callback; return { on: vi.fn(), close: vi.fn() } }) }
  })
  const service = await import('./extensionService')
  service.__resetExtensionServiceForTests()
  return { service, handlers }
}

async function createDevelopmentPackage(id = 'com.example.dev') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zura-dev-extension-'))
  await writeFile(path.join(root, 'zura-extension.json'), JSON.stringify({
    schemaVersion: 1, id, name: 'Dev Extension', publisher: '@developer', version: '1.0.0', description: 'Development extension', icon: 'icon.svg', platforms: ['windows'], categories: ['Productivity'], commands: [{ id: 'home', title: 'Dev Home', mode: 'view', entry: 'ui/home.json', keywords: ['dev'] }], permissions: ['storage.local', 'filesystem.file-selection', 'network.example.com'], networkDomains: ['example.com'], privacy: { dataLeavesDevice: false },
  }))
  await writeFile(path.join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  await mkdir(path.join(root, 'ui'))
  await writeFile(path.join(root, 'ui', 'home.json'), JSON.stringify({ schemaVersion: 1, rootViewId: 'home', views: { home: { id: 'home', kind: 'detail', title: 'Dev Home', markdown: 'Version one' } } }))
  return root
}

describe('extensionService', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); selectedDevelopmentRoot = ''; developmentWatchCallback = undefined })

  it('discovers bundled manifests and completes install, storage, disable, enable, and uninstall', async () => {
    const { service } = await loadService()
    const discovered = await service.listExtensions()
    expect(discovered.map((item) => item.manifest.id)).toEqual(expect.arrayContaining(['com.zuraai.github', 'com.zuraai.welcome']))

    const review = await service.prepareExtensionMutation('com.zuraai.welcome', 'install')
    expect(review.addedPermissions).toEqual(['storage.local'])
    await expect(service.applyExtensionMutation('not-a-real-confirmation')).rejects.toThrow('confirmation expired')
    await service.applyExtensionMutation(review.confirmationId)
    expect(await service.isExtensionInstalled('com.zuraai.welcome')).toBe(true)

    const home = await service.getExtensionView('com.zuraai.welcome', 'welcome')
    expect(home).toMatchObject({ kind: 'list', id: 'home' })
    const openForm = await service.executeExtensionAction('com.zuraai.welcome', 'welcome', 'home', 'open-form')
    expect(openForm.view).toMatchObject({ kind: 'form', id: 'form' })
    const saved = await service.executeExtensionAction('com.zuraai.welcome', 'welcome', 'form', 'save-greeting', { greeting: 'Hello' })
    expect(saved).toMatchObject({ ok: true, storageChanged: true, view: { id: 'saved' } })
    expect(await service.getExtensionStorage('com.zuraai.welcome')).toEqual({ greeting: 'Hello' })

    await service.setExtensionEnabled('com.zuraai.welcome', false)
    await expect(service.getExtensionView('com.zuraai.welcome', 'welcome')).rejects.toThrow('not installed and enabled')
    await service.setExtensionEnabled('com.zuraai.welcome', true)
    const uninstall = await service.prepareExtensionMutation('com.zuraai.welcome', 'uninstall')
    await service.applyExtensionMutation(uninstall.confirmationId)
    expect(await service.isExtensionInstalled('com.zuraai.welcome')).toBe(false)
    await expect(readFile(path.join(userData, 'zura-extension-storage', `${crypto.createHash('sha256').update('com.zuraai.welcome').digest('hex')}.json`))).rejects.toThrow()
  })

  it('does not let an IPC caller self-approve an extension mutation', async () => {
    const { service } = await loadService()
    const review = await service.prepareExtensionMutation('com.zuraai.welcome', 'install')
    await expect(service.confirmAndApplyExtensionMutation(review.confirmationId)).rejects.toThrow('cancelled by the user')
    expect(await service.isExtensionInstalled('com.zuraai.welcome')).toBe(false)
    await expect(service.applyExtensionMutation(review.confirmationId)).rejects.toThrow('confirmation expired')
  })

  it('migrates the original GitHub product installation', async () => {
    const { service } = await loadService()
    await writeFile(path.join(userData, 'zura-store-products.json'), JSON.stringify({ installed: ['github'] }))
    service.__resetExtensionServiceForTests()
    expect(await service.isExtensionInstalled('com.zuraai.github')).toBe(true)
  })

  it('imports a development package, hot reloads it, and prevents duplicate IDs', async () => {
    const { service } = await loadService()
    selectedDevelopmentRoot = await createDevelopmentPackage()
    const extensions = await service.importDevelopmentExtension()
    expect(extensions.find((item) => item.manifest.id === 'com.example.dev')?.trust).toBe('development')
    const uiPath = path.join(selectedDevelopmentRoot, 'ui', 'home.json')
    await writeFile(uiPath, JSON.stringify({ schemaVersion: 1, rootViewId: 'home', views: { home: { id: 'home', kind: 'detail', title: 'Reloaded', markdown: 'Version two' } } }))
    developmentWatchCallback?.()
    await new Promise((resolve) => setTimeout(resolve, 250))
    const review = await service.prepareExtensionMutation('com.example.dev', 'install')
    await service.applyExtensionMutation(review.confirmationId)
    expect(await service.getExtensionView('com.example.dev', 'home')).toMatchObject({ title: 'Reloaded' })

    const selectedFile = path.join(selectedDevelopmentRoot, 'sample.txt')
    await writeFile(selectedFile, 'opaque file contents')
    selectedDevelopmentRoot = selectedFile
    const handle = await service.pickExtensionFile('com.example.dev', 'file')
    expect(handle).toMatchObject({ name: 'sample.txt', kind: 'file' })
    expect(handle).not.toHaveProperty('path')
    expect(await service.readExtensionFileHandle('com.example.dev', handle!.id)).toBe('opaque file contents')

    const originalFetch = global.fetch
    global.fetch = vi.fn(async () => new Response('network ok', { status: 200, headers: { 'content-type': 'text/plain' } }))
    await expect(service.requestExtensionNetwork('com.example.dev', { domain: 'undeclared.example', path: '/', method: 'GET' })).rejects.toThrow('not declared')
    await expect(service.requestExtensionNetwork('com.example.dev', { domain: 'example.com', path: '//evil.test', method: 'GET' })).rejects.toThrow('bounded absolute URL path')
    expect(await service.requestExtensionNetwork('com.example.dev', { domain: 'example.com', path: '/v1/status', method: 'GET' })).toMatchObject({ ok: true, body: 'network ok' })
    global.fetch = originalFetch

    const duplicate = await createDevelopmentPackage('com.zuraai.github')
    selectedDevelopmentRoot = duplicate
    await expect(service.importDevelopmentExtension()).rejects.toThrow('Duplicate extension id')
  })

  it('rejects development packages that request privileged host capabilities', async () => {
    const { service } = await loadService()
    selectedDevelopmentRoot = await createDevelopmentPackage()
    const manifestPath = path.join(selectedDevelopmentRoot, 'zura-extension.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.commands[0].entry = 'host:git-workspace'
    manifest.capabilities = { host: ['git-workspace'] }
    await writeFile(manifestPath, JSON.stringify(manifest))
    await expect(service.importDevelopmentExtension()).rejects.toThrow('cannot request host capabilities')
  })

  it('requires a new review when permissions change before installation', async () => {
    const { service } = await loadService()
    selectedDevelopmentRoot = await createDevelopmentPackage('com.example.permissions')
    await service.importDevelopmentExtension()
    const review = await service.prepareExtensionMutation('com.example.permissions', 'install')
    const manifestPath = path.join(selectedDevelopmentRoot, 'zura-extension.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.permissions.push('network.additional.example')
    manifest.networkDomains.push('additional.example')
    await writeFile(manifestPath, JSON.stringify(manifest))
    await service.discoverExtensions(true)
    await expect(service.applyExtensionMutation(review.confirmationId)).rejects.toThrow('changed after review')
  })

  it('rejects oversized development packages before import', async () => {
    const { service } = await loadService()
    selectedDevelopmentRoot = await createDevelopmentPackage('com.example.oversized')
    await writeFile(path.join(selectedDevelopmentRoot, 'oversized.bin'), Buffer.alloc(5 * 1024 * 1024 + 1))
    await expect(service.importDevelopmentExtension()).rejects.toThrow('exceeds 5 MB')
  })

  it('rejects symlinks and stale registry identities', async () => {
    const { service } = await loadService()
    selectedDevelopmentRoot = await createDevelopmentPackage('com.example.symlink')
    const outside = await mkdtemp(path.join(os.tmpdir(), 'zura-outside-'))
    await writeFile(path.join(outside, 'secret.txt'), 'secret')
    await symlink(outside, path.join(selectedDevelopmentRoot, 'linked-outside'), 'junction')
    await expect(service.importDevelopmentExtension()).rejects.toThrow('symbolic links')

    await writeFile(path.join(userData, 'zura-extensions.json'), JSON.stringify({ version: 1, installed: { 'com.missing.stale': { version: '1.0.0', enabled: true, source: 'bundled', approvedPermissions: [], installedAt: Date.now() } }, developmentRoots: [] }))
    service.__resetExtensionServiceForTests()
    expect((await service.listExtensions()).some((item) => item.manifest.id === 'com.missing.stale')).toBe(false)
    await expect(service.prepareExtensionMutation('com.missing.stale', 'uninstall')).rejects.toThrow('not found')
  })

  it('isolates extension storage and rejects arbitrary action and IPC names', async () => {
    const { service, handlers } = await loadService()
    service.registerExtensionHandlers()
    expect(handlers.has('extensions:shell')).toBe(false)

    const welcomeInstall = await service.prepareExtensionMutation('com.zuraai.welcome', 'install')
    await service.applyExtensionMutation(welcomeInstall.confirmationId)
    await service.executeNoViewExtensionCommand('com.zuraai.welcome', 'remember-visit')

    selectedDevelopmentRoot = await createDevelopmentPackage('com.example.isolated')
    await writeFile(path.join(selectedDevelopmentRoot, 'ui', 'home.json'), JSON.stringify({ schemaVersion: 1, rootViewId: 'run', views: { run: { id: 'run', kind: 'empty', title: 'Run', actions: [{ id: 'save', title: 'Save', kind: 'storage.set', key: 'visited', value: 'isolated' }] } } }))
    const manifestPath = path.join(selectedDevelopmentRoot, 'zura-extension.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.commands[0].mode = 'no-view'
    await writeFile(manifestPath, JSON.stringify(manifest))
    await service.importDevelopmentExtension()
    const isolatedInstall = await service.prepareExtensionMutation('com.example.isolated', 'install')
    await service.applyExtensionMutation(isolatedInstall.confirmationId)
    await service.executeNoViewExtensionCommand('com.example.isolated', 'home')

    expect(await service.getExtensionStorage('com.zuraai.welcome')).toEqual({ visited: 'yes' })
    expect(await service.getExtensionStorage('com.example.isolated')).toEqual({ visited: 'isolated' })
    expect(await service.executeExtensionAction('com.example.isolated', 'home', 'run', 'shell-exec')).toMatchObject({ ok: false, error: expect.stringContaining('not allowed') })
  })

  it('executes no-view commands without opening renderer UI', async () => {
    const { service } = await loadService()
    const install = await service.prepareExtensionMutation('com.zuraai.welcome', 'install')
    await service.applyExtensionMutation(install.confirmationId)
    expect(await service.executeNoViewExtensionCommand('com.zuraai.welcome', 'remember-visit')).toMatchObject({ ok: true, storageChanged: true })
    expect(await service.getExtensionStorage('com.zuraai.welcome')).toMatchObject({ visited: 'yes' })
    await expect(service.getExtensionView('com.zuraai.welcome', 'remember-visit')).resolves.toMatchObject({ id: 'run' })
    expect(await service.executeNoViewExtensionCommand('com.zuraai.welcome', 'welcome')).toMatchObject({ ok: false, error: expect.stringContaining('not a no-view') })
  })

  it('exposes updates and preserves the installed version when an update fails review', async () => {
    const { service } = await loadService()
    selectedDevelopmentRoot = await createDevelopmentPackage('com.example.update')
    await service.importDevelopmentExtension()
    const install = await service.prepareExtensionMutation('com.example.update', 'install')
    await service.applyExtensionMutation(install.confirmationId)

    const manifestPath = path.join(selectedDevelopmentRoot, 'zura-extension.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.version = '2.0.0'
    await writeFile(manifestPath, JSON.stringify(manifest))
    await service.discoverExtensions(true)
    expect((await service.listExtensions()).find((item) => item.manifest.id === 'com.example.update')).toMatchObject({ installedVersion: '1.0.0', updateAvailable: true })

    const update = await service.prepareExtensionMutation('com.example.update', 'update')
    manifest.permissions.push('network.new.example')
    manifest.networkDomains.push('new.example')
    await writeFile(manifestPath, JSON.stringify(manifest))
    await service.discoverExtensions(true)
    await expect(service.applyExtensionMutation(update.confirmationId)).rejects.toThrow('changed after review')
    expect((await service.listExtensions()).find((item) => item.manifest.id === 'com.example.update')?.installedVersion).toBe('1.0.0')

    const reviewedUpdate = await service.prepareExtensionMutation('com.example.update', 'update')
    expect(reviewedUpdate.addedPermissions).toContain('network.new.example')
    await service.applyExtensionMutation(reviewedUpdate.confirmationId)
    expect((await service.listExtensions()).find((item) => item.manifest.id === 'com.example.update')).toMatchObject({ installedVersion: '2.0.0', updateAvailable: false })
  })
})
