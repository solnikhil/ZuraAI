import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { watch, type FSWatcher } from 'fs'
import fs from 'fs/promises'
import crypto from 'crypto'
import path from 'path'

import { writeFileAtomic } from '../utils/atomicFile'
import {
  findViewAction,
  parseExtensionManifestText,
  parseExtensionViewText,
} from '../../src/extensions/validation'
import type {
  ZuraExtensionActionResult,
  ZuraExtensionManifest,
  ZuraExtensionMutationReview,
  ZuraExtensionNetworkRequest,
  ZuraExtensionNetworkResponse,
  ZuraExtensionFileHandle,
  ZuraExtensionSummary,
  ZuraExtensionView,
  ZuraExtensionViewDocument,
} from '../../src/extensions/types'

const REGISTRY_FILE = 'zura-extensions.json'
const LEGACY_PRODUCTS_FILE = 'zura-store-products.json'
const STORAGE_DIRECTORY = 'zura-extension-storage'
const MAX_PACKAGES = 100
const MAX_PACKAGE_BYTES = 5 * 1024 * 1024
const MAX_PACKAGE_FILES = 500
const MAX_PACKAGE_DEPTH = 16
const MAX_STORAGE_BYTES = 128 * 1024
const MAX_STORAGE_KEYS = 256
const MAX_FORM_VALUES = 64
const MAX_FORM_VALUE_LENGTH = 10_000
const CONFIRMATION_TTL_MS = 5 * 60_000
const NETWORK_TIMEOUT_MS = 15_000
const MAX_NETWORK_BODY_BYTES = 64 * 1024
const MAX_NETWORK_RESPONSE_BYTES = 1024 * 1024
const FILE_HANDLE_TTL_MS = 10 * 60_000
const MAX_FILE_HANDLE_BYTES = 1024 * 1024

type ExtensionSource = 'bundled' | 'development'
interface InstalledRecord {
  version: string
  enabled: boolean
  source: ExtensionSource
  approvedPermissions: string[]
  installedAt: number
}
interface RegistryFile {
  version: 1
  installed: Record<string, InstalledRecord>
  developmentRoots: string[]
}
interface DiscoveredPackage {
  root: string
  source: ExtensionSource
  trust: 'reviewed' | 'development'
  manifest?: ZuraExtensionManifest
  errors: string[]
  iconDataUrl?: string
  changelogText?: string
}
interface LifecycleHooks { onUninstall?: () => Promise<void> }

let registryLoaded = false
let registry: RegistryFile = { version: 1, installed: {}, developmentRoots: [] }
let packages = new Map<string, DiscoveredPackage>()
let discoveryRequest: Promise<void> | null = null
const confirmations = new Map<string, ZuraExtensionMutationReview>()
const developmentWatchers = new Map<string, FSWatcher>()
const lifecycleHooks = new Map<string, LifecycleHooks>()
const fileHandles = new Map<string, { extensionId: string; path: string; kind: 'file' | 'directory'; expiresAt: number }>()

const registryPath = () => path.join(app.getPath('userData'), REGISTRY_FILE)
const legacyProductsPath = () => path.join(app.getPath('userData'), LEGACY_PRODUCTS_FILE)
const storageRoot = () => path.join(app.getPath('userData'), STORAGE_DIRECTORY)
const storagePath = (extensionId: string) => path.join(storageRoot(), `${crypto.createHash('sha256').update(extensionId).digest('hex')}.json`)

function bundledRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'extensions')
    : path.join(app.getAppPath(), 'extensions', 'bundled')
}

function currentPlatform(): 'windows' | 'macos' | 'linux' {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
}

function cleanRegistry(value: unknown): RegistryFile {
  if (!value || typeof value !== 'object') return { version: 1, installed: {}, developmentRoots: [] }
  const raw = value as Record<string, unknown>
  const installed: Record<string, InstalledRecord> = {}
  if (raw.installed && typeof raw.installed === 'object' && !Array.isArray(raw.installed)) {
    for (const [id, candidate] of Object.entries(raw.installed as Record<string, unknown>).slice(0, MAX_PACKAGES)) {
      if (!candidate || typeof candidate !== 'object') continue
      const record = candidate as Record<string, unknown>
      if (typeof record.version !== 'string' || !Array.isArray(record.approvedPermissions)) continue
      installed[id] = {
        version: record.version.slice(0, 40),
        enabled: record.enabled === true,
        source: record.source === 'development' ? 'development' : 'bundled',
        approvedPermissions: record.approvedPermissions.filter((item): item is string => typeof item === 'string').slice(0, 64),
        installedAt: typeof record.installedAt === 'number' && Number.isFinite(record.installedAt) ? record.installedAt : Date.now(),
      }
    }
  }
  return {
    version: 1,
    installed,
    developmentRoots: Array.isArray(raw.developmentRoots)
      ? raw.developmentRoots.filter((item): item is string => typeof item === 'string').slice(0, MAX_PACKAGES)
      : [],
  }
}

async function loadRegistry(): Promise<void> {
  if (registryLoaded) return
  registryLoaded = true
  try { registry = cleanRegistry(JSON.parse(await fs.readFile(registryPath(), 'utf8'))) } catch { registry = { version: 1, installed: {}, developmentRoots: [] } }
  // One-time migration from the original GitHub-only product flag.
  if (!registry.installed['com.zuraai.github']) {
    try {
      const legacy = JSON.parse(await fs.readFile(legacyProductsPath(), 'utf8')) as { installed?: unknown }
      if (Array.isArray(legacy.installed) && legacy.installed.includes('github')) {
        registry.installed['com.zuraai.github'] = { version: '1.0.0', enabled: true, source: 'bundled', approvedPermissions: ['github.account', 'git.repositories', 'filesystem.repository-selection', 'network.github.com', 'network.api.github.com'], installedAt: Date.now() }
        await saveRegistry()
      }
    } catch { /* no legacy state */ }
  }
}

async function saveRegistry(): Promise<void> {
  await writeFileAtomic(registryPath(), JSON.stringify(registry, null, 2))
}

async function ensureInsideRoot(root: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) throw new Error('Extension path must be relative.')
  const canonicalRoot = await fs.realpath(root)
  const target = path.resolve(canonicalRoot, relativePath)
  const canonicalTarget = await fs.realpath(target)
  const prefix = canonicalRoot.endsWith(path.sep) ? canonicalRoot : `${canonicalRoot}${path.sep}`
  if (!canonicalTarget.startsWith(prefix)) throw new Error('Extension path escapes its package root.')
  return canonicalTarget
}

async function loadIcon(root: string, icon: string): Promise<string | undefined> {
  try {
    const iconPath = await ensureInsideRoot(root, icon)
    const ext = path.extname(iconPath).toLowerCase()
    if (!['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return undefined
    const data = await fs.readFile(iconPath)
    if (data.byteLength > 1024 * 1024) return undefined
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${data.toString('base64')}`
  } catch { return undefined }
}

async function loadChangelog(root: string, changelog?: string): Promise<string | undefined> {
  if (!changelog) return undefined
  try {
    const file = await ensureInsideRoot(root, changelog)
    const stat = await fs.stat(file)
    if (!stat.isFile() || stat.size > 64 * 1024) return undefined
    return (await fs.readFile(file, 'utf8')).slice(0, 64 * 1024)
  } catch { return undefined }
}

async function validatePackageTree(current: string, depth = 0, budget = { files: 0, bytes: 0 }): Promise<void> {
  if (depth > MAX_PACKAGE_DEPTH) throw new Error('Extension package exceeds its directory depth limit.')
  const entries = await fs.readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(current, entry.name)
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink()) throw new Error('Extension packages cannot contain symbolic links.')
    budget.files += 1
    budget.bytes += stat.size
    if (budget.files > MAX_PACKAGE_FILES) throw new Error('Extension package exceeds 500 files.')
    if (budget.bytes > MAX_PACKAGE_BYTES) throw new Error('Extension package exceeds 5 MB.')
    if (stat.isDirectory()) await validatePackageTree(target, depth + 1, budget)
  }
}

async function discoverPackage(root: string, source: ExtensionSource): Promise<DiscoveredPackage> {
  const trust = source === 'bundled' ? 'reviewed' : 'development'
  try {
    const stat = await fs.lstat(root)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return { root, source, trust, errors: ['Package root must be a real directory.'] }
    await validatePackageTree(root)
    const manifestPath = await ensureInsideRoot(root, 'zura-extension.json')
    const parsed = parseExtensionManifestText(await fs.readFile(manifestPath, 'utf8'))
    if (!parsed.manifest) return { root, source, trust, errors: parsed.errors }
    if (!parsed.manifest.platforms.includes(currentPlatform())) return { root, source, trust, manifest: parsed.manifest, errors: [`Extension does not support ${currentPlatform()}.`] }
    if (source === 'development' && parsed.manifest.commands.some((command) => command.entry.startsWith('host:'))) return { root, source, trust, manifest: parsed.manifest, errors: ['Development extensions cannot request host capabilities.'] }
    for (const command of parsed.manifest.commands) {
      if (!command.entry.startsWith('ui/')) continue
      const entryPath = await ensureInsideRoot(root, command.entry)
      const view = parseExtensionViewText(await fs.readFile(entryPath, 'utf8'))
      if (!view.document) parsed.errors.push(...view.errors.map((error) => `${command.id}: ${error}`))
    }
    return { root, source, trust, manifest: parsed.manifest, errors: parsed.errors, iconDataUrl: await loadIcon(root, parsed.manifest.icon), changelogText: await loadChangelog(root, parsed.manifest.changelog) }
  } catch (error) {
    return { root, source, trust, errors: [error instanceof Error ? error.message : 'Unable to read extension package.'] }
  }
}

function emitChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('extensions:changed')
}

function stopDevelopmentWatchers(): void {
  for (const watcher of developmentWatchers.values()) watcher.close()
  developmentWatchers.clear()
}

function watchDevelopmentPackage(root: string): void {
  if (developmentWatchers.has(root)) return
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const watcher = watch(root, { recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { packages.clear(); discoveryRequest = null; void discoverExtensions().then(emitChanged) }, 200)
    })
    watcher.on('error', () => { watcher.close(); developmentWatchers.delete(root) })
    developmentWatchers.set(root, watcher)
  } catch { /* development watching is best effort */ }
}

export async function discoverExtensions(force = false): Promise<void> {
  await loadRegistry()
  if (packages.size && !force) return
  if (discoveryRequest) return discoveryRequest
  discoveryRequest = (async () => {
    const found = new Map<string, DiscoveredPackage>()
    const bundledDirectories = await fs.readdir(bundledRoot(), { withFileTypes: true }).catch(() => [])
    const roots = [
      ...bundledDirectories.filter((entry) => entry.isDirectory()).slice(0, MAX_PACKAGES).map((entry) => ({ root: path.join(bundledRoot(), entry.name), source: 'bundled' as const })),
      ...registry.developmentRoots.map((root) => ({ root, source: 'development' as const })),
    ]
    for (const candidate of roots.slice(0, MAX_PACKAGES)) {
      const discovered = await discoverPackage(candidate.root, candidate.source)
      const id = discovered.manifest?.id
      if (!id) continue
      if (found.has(id)) {
        found.get(id)!.errors.push(`Duplicate extension id also found at ${candidate.root}.`)
        discovered.errors.push(`Duplicate extension id: ${id}.`)
        continue
      }
      found.set(id, discovered)
      if (candidate.source === 'development') watchDevelopmentPackage(candidate.root)
    }
    packages = found
  })().finally(() => { discoveryRequest = null })
  return discoveryRequest
}

function summaryFor(pkg: DiscoveredPackage): ZuraExtensionSummary | undefined {
  if (!pkg.manifest) return undefined
  const installed = registry.installed[pkg.manifest.id]
  return {
    manifest: pkg.manifest,
    trust: pkg.trust,
    installed: Boolean(installed),
    enabled: Boolean(installed?.enabled),
    installedVersion: installed?.version,
    updateAvailable: Boolean(installed && installed.version !== pkg.manifest.version),
    source: pkg.source,
    validationErrors: [...pkg.errors],
    iconDataUrl: pkg.iconDataUrl,
    changelogText: pkg.changelogText,
  }
}

export async function listExtensions(): Promise<ZuraExtensionSummary[]> {
  await discoverExtensions()
  return [...packages.values()].flatMap((pkg) => { const summary = summaryFor(pkg); return summary ? [summary] : [] }).sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}

export async function listEnabledExtensionCommands(): Promise<Array<{ extensionId: string; commandId: string; mode: ZuraExtensionManifest['commands'][number]['mode']; title: string; subtitle: string; aliases: string[]; hostCapability?: string; iconDataUrl?: string }>> {
  const extensions = await listExtensions()
  return extensions.flatMap((extension) => {
    if (!extension.installed || !extension.enabled || extension.validationErrors.length) return []
    return extension.manifest.commands.map((command) => ({
      extensionId: extension.manifest.id,
      commandId: command.id,
      mode: command.mode,
      title: command.title,
      subtitle: `${extension.manifest.name} · ${extension.manifest.publisher}`,
      aliases: [extension.manifest.name, extension.manifest.publisher, ...command.keywords],
      hostCapability: command.entry.startsWith('host:') ? command.entry.slice(5) : undefined,
      iconDataUrl: extension.iconDataUrl,
    }))
  })
}

export async function isExtensionInstalled(id: string): Promise<boolean> {
  await loadRegistry()
  return Boolean(registry.installed[id]?.enabled)
}

export function registerExtensionLifecycle(id: string, hooks: LifecycleHooks): void {
  lifecycleHooks.set(id, hooks)
}

function extensionById(id: unknown): DiscoveredPackage {
  if (typeof id !== 'string' || id.length > 128) throw new Error('Invalid extension id.')
  const pkg = packages.get(id)
  if (!pkg?.manifest) throw new Error('Extension was not found.')
  if (pkg.errors.length) throw new Error(pkg.errors[0])
  return pkg
}

export async function prepareExtensionMutation(extensionId: unknown, action: unknown): Promise<ZuraExtensionMutationReview> {
  await discoverExtensions()
  if (action !== 'install' && action !== 'update' && action !== 'uninstall') throw new Error('Invalid extension mutation.')
  const pkg = extensionById(extensionId)
  const current = registry.installed[pkg.manifest!.id]
  if (action === 'install' && current) throw new Error('Extension is already installed.')
  if ((action === 'update' || action === 'uninstall') && !current) throw new Error('Extension is not installed.')
  const summary = summaryFor(pkg)!
  const addedPermissions = pkg.manifest!.permissions.filter((permission) => !current?.approvedPermissions.includes(permission))
  const review: ZuraExtensionMutationReview = { confirmationId: crypto.randomUUID(), action, extension: summary, addedPermissions, expiresAt: Date.now() + CONFIRMATION_TTL_MS }
  confirmations.set(review.confirmationId, review)
  return review
}

export async function applyExtensionMutation(confirmationId: unknown): Promise<ZuraExtensionSummary[]> {
  if (typeof confirmationId !== 'string') throw new Error('Invalid confirmation.')
  const review = confirmations.get(confirmationId)
  confirmations.delete(confirmationId)
  if (!review || review.expiresAt < Date.now()) throw new Error('Extension confirmation expired. Review the change again.')
  await discoverExtensions()
  const pkg = extensionById(review.extension.manifest.id)
  const reviewedManifest = review.extension.manifest
  if (
    pkg.manifest!.version !== reviewedManifest.version ||
    JSON.stringify([...pkg.manifest!.permissions].sort()) !==
      JSON.stringify([...reviewedManifest.permissions].sort())
  ) {
    throw new Error('Extension package changed after review. Review its permissions again.')
  }
  const previousInstalled = { ...registry.installed }
  try {
    if (review.action === 'uninstall') {
      await lifecycleHooks.get(pkg.manifest!.id)?.onUninstall?.()
      delete registry.installed[pkg.manifest!.id]
    } else {
      const prior = registry.installed[pkg.manifest!.id]
      registry.installed[pkg.manifest!.id] = {
        version: pkg.manifest!.version,
        enabled: true,
        source: pkg.source,
        approvedPermissions: [...pkg.manifest!.permissions],
        installedAt: prior?.installedAt ?? Date.now(),
      }
    }
    await saveRegistry()
  } catch (error) {
    registry.installed = previousInstalled
    throw error
  }
  if (review.action === 'uninstall') await fs.rm(storagePath(pkg.manifest!.id), { force: true }).catch(() => undefined)
  emitChanged()
  return listExtensions()
}

export async function confirmAndApplyExtensionMutation(confirmationId: unknown, parent?: Electron.BrowserWindow): Promise<ZuraExtensionSummary[]> {
  if (typeof confirmationId !== 'string') throw new Error('Invalid confirmation.')
  const review = confirmations.get(confirmationId)
  if (!review || review.expiresAt < Date.now()) {
    confirmations.delete(confirmationId)
    throw new Error('Extension confirmation expired. Review the change again.')
  }
  const manifest = review.extension.manifest
  const permissionText = review.action === 'uninstall'
    ? 'Extension-owned settings and authorization will be removed. External user data will not be deleted.'
    : `Requested permissions:\n${manifest.permissions.length ? manifest.permissions.map((permission) => `• ${permission}`).join('\n') : '• None'}`
  const options: Electron.MessageBoxOptions = {
    type: review.action === 'uninstall' ? 'warning' : 'question',
    title: 'ZuraAI Extension Approval',
    message: `${review.action === 'uninstall' ? 'Uninstall' : review.action === 'update' ? 'Update' : 'Install'} ${manifest.name}?`,
    detail: `${manifest.publisher} · v${manifest.version}\n\n${permissionText}`,
    buttons: [review.action === 'uninstall' ? 'Uninstall' : review.action === 'update' ? 'Update' : 'Install', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
  const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (result.response !== 0) {
    confirmations.delete(confirmationId)
    throw new Error('Extension change was cancelled by the user.')
  }
  return applyExtensionMutation(confirmationId)
}

export async function setExtensionEnabled(extensionId: unknown, enabled: unknown): Promise<ZuraExtensionSummary[]> {
  await discoverExtensions()
  const pkg = extensionById(extensionId)
  const record = registry.installed[pkg.manifest!.id]
  if (!record) throw new Error('Extension is not installed.')
  if (typeof enabled !== 'boolean') throw new Error('Enabled state must be boolean.')
  record.enabled = enabled
  await saveRegistry()
  emitChanged()
  return listExtensions()
}

export async function importDevelopmentExtension(): Promise<ZuraExtensionSummary[]> {
  if (app.isPackaged) throw new Error('Development imports are disabled in packaged builds.')
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Import Zura extension', buttonLabel: 'Import extension' })
  if (result.canceled || !result.filePaths[0]) return listExtensions()
  const root = await fs.realpath(result.filePaths[0])
  const discovered = await discoverPackage(root, 'development')
  if (!discovered.manifest || discovered.errors.length) throw new Error(discovered.errors.join(' '))
  const existing = packages.get(discovered.manifest.id)
  if (existing && existing.root !== root) throw new Error(`Duplicate extension id: ${discovered.manifest.id}.`)
  if (!registry.developmentRoots.includes(root)) registry.developmentRoots.push(root)
  await saveRegistry()
  packages.clear()
  await discoverExtensions(true)
  emitChanged()
  return listExtensions()
}

export async function removeDevelopmentExtension(extensionId: unknown): Promise<ZuraExtensionSummary[]> {
  await discoverExtensions()
  const pkg = extensionById(extensionId)
  if (pkg.source !== 'development') throw new Error('Bundled extensions cannot be removed from development imports.')
  if (registry.installed[pkg.manifest!.id]) throw new Error('Uninstall this extension before removing its development package.')
  registry.developmentRoots = registry.developmentRoots.filter((root) => root !== pkg.root)
  developmentWatchers.get(pkg.root)?.close()
  developmentWatchers.delete(pkg.root)
  await saveRegistry()
  packages.clear()
  await discoverExtensions(true)
  emitChanged()
  return listExtensions()
}

async function loadViewDocument(pkg: DiscoveredPackage, commandId: string): Promise<{ command: ZuraExtensionManifest['commands'][number]; document: ZuraExtensionViewDocument }> {
  const command = pkg.manifest!.commands.find((item) => item.id === commandId)
  if (!command) throw new Error('Extension command was not found.')
  if (command.entry.startsWith('host:')) throw new Error('Host capability commands use their dedicated workspace surface.')
  const file = await ensureInsideRoot(pkg.root, command.entry)
  const parsed = parseExtensionViewText(await fs.readFile(file, 'utf8'))
  if (!parsed.document) throw new Error(parsed.errors.join(' '))
  return { command, document: parsed.document }
}

async function requireEnabledPackage(extensionId: unknown): Promise<DiscoveredPackage> {
  await discoverExtensions()
  const pkg = extensionById(extensionId)
  if (!registry.installed[pkg.manifest!.id]?.enabled) throw new Error('Extension is not installed and enabled.')
  return pkg
}

export async function getExtensionView(extensionId: unknown, commandId: unknown, viewId?: unknown): Promise<ZuraExtensionView> {
  const pkg = await requireEnabledPackage(extensionId)
  if (typeof commandId !== 'string' || (viewId !== undefined && typeof viewId !== 'string')) throw new Error('Invalid view request.')
  const { document } = await loadViewDocument(pkg, commandId)
  const id = typeof viewId === 'string' ? viewId : document.rootViewId
  const view = document.views[id]
  if (!view) throw new Error('Extension view was not found.')
  return view
}

async function readStorage(extensionId: string): Promise<Record<string, string | boolean>> {
  try {
    const stat = await fs.stat(storagePath(extensionId))
    if (stat.size > MAX_STORAGE_BYTES) throw new Error('Extension storage exceeds its limit.')
    const parsed = JSON.parse(await fs.readFile(storagePath(extensionId), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const values: Record<string, string | boolean> = {}
    for (const [key, value] of Object.entries(parsed).slice(0, MAX_STORAGE_KEYS)) {
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && (typeof value === 'string' || typeof value === 'boolean')) values[key] = value
    }
    return values
  } catch (error) {
    if (error instanceof Error && error.message.includes('exceeds')) throw error
    return {}
  }
}

async function writeStorage(extensionId: string, values: Record<string, string | boolean>): Promise<void> {
  const serialized = JSON.stringify(values, null, 2)
  if (new TextEncoder().encode(serialized).byteLength > MAX_STORAGE_BYTES) throw new Error('Extension storage limit exceeded.')
  await fs.mkdir(storageRoot(), { recursive: true })
  await writeFileAtomic(storagePath(extensionId), serialized)
}

function sanitizeFormValues(values: unknown): Record<string, string | boolean> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {}
  const entries = Object.entries(values as Record<string, unknown>)
  if (entries.length > MAX_FORM_VALUES) throw new Error('Too many form values.')
  const sanitized: Record<string, string | boolean> = {}
  for (const [key, value] of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new Error('Invalid form field id.')
    if (typeof value === 'boolean') sanitized[key] = value
    else if (typeof value === 'string' && value.length <= MAX_FORM_VALUE_LENGTH) sanitized[key] = value
    else throw new Error('Invalid form value.')
  }
  return sanitized
}

export async function executeExtensionAction(extensionId: unknown, commandId: unknown, viewId: unknown, actionId: unknown, values?: unknown): Promise<ZuraExtensionActionResult> {
  try {
    const pkg = await requireEnabledPackage(extensionId)
    if (![commandId, viewId, actionId].every((item) => typeof item === 'string')) throw new Error('Invalid extension action request.')
    const { document } = await loadViewDocument(pkg, commandId as string)
    const view = document.views[viewId as string]
    if (!view) throw new Error('Extension view was not found.')
    const action = findViewAction(view, actionId as string)
    if (!action) throw new Error('Extension action is not allowed.')
    let nextViewId: string | undefined
    let storageChanged = false
    if (action.kind === 'navigate') nextViewId = action.viewId
    if (action.kind === 'storage.set') {
      const safeValues = sanitizeFormValues(values)
      const value = action.valueFromField ? safeValues[action.valueFromField] : action.value
      if (typeof value !== 'string' && typeof value !== 'boolean') throw new Error('Required form value is missing.')
      const stored = await readStorage(pkg.manifest!.id)
      stored[action.key] = value
      await writeStorage(pkg.manifest!.id, stored)
      storageChanged = true
      nextViewId = action.nextViewId
    }
    if (action.kind === 'storage.remove') {
      const stored = await readStorage(pkg.manifest!.id)
      delete stored[action.key]
      await writeStorage(pkg.manifest!.id, stored)
      storageChanged = true
      nextViewId = action.nextViewId
    }
    return { ok: true, view: nextViewId ? document.views[nextViewId] : view, storageChanged }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Extension action failed.' } }
}

export async function executeNoViewExtensionCommand(extensionId: unknown, commandId: unknown): Promise<ZuraExtensionActionResult> {
  try {
    const pkg = await requireEnabledPackage(extensionId)
    if (typeof commandId !== 'string') throw new Error('Invalid no-view command request.')
    const { command, document } = await loadViewDocument(pkg, commandId)
    if (command.mode !== 'no-view') throw new Error('Extension command is not a no-view command.')
    const root = document.views[document.rootViewId]
    const actions = 'actions' in root && Array.isArray(root.actions) ? root.actions : []
    if (actions.length !== 1 || root.kind === 'list' || actions[0].kind === 'navigate') throw new Error('A no-view command must expose exactly one non-navigation root action.')
    return executeExtensionAction(pkg.manifest!.id, commandId, root.id, actions[0].id)
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Extension command failed.' } }
}

export async function getExtensionStorage(extensionId: unknown): Promise<Record<string, string | boolean>> {
  const pkg = await requireEnabledPackage(extensionId)
  return readStorage(pkg.manifest!.id)
}

function validateNetworkRequest(pkg: DiscoveredPackage, request: unknown): ZuraExtensionNetworkRequest {
  if (!request || typeof request !== 'object') throw new Error('Invalid extension network request.')
  const body = request as Record<string, unknown>
  if (typeof body.domain !== 'string' || !pkg.manifest!.networkDomains?.includes(body.domain)) throw new Error('Network domain is not declared by this extension.')
  if (!pkg.manifest!.permissions.includes(`network.${body.domain}`)) throw new Error('Network permission was not approved for this domain.')
  if (body.method !== 'GET' && body.method !== 'POST') throw new Error('Only GET and POST are supported.')
  if (typeof body.path !== 'string' || !body.path.startsWith('/') || body.path.startsWith('//') || body.path.length > 2_048) throw new Error('Network path must be a bounded absolute URL path.')
  if (body.body !== undefined && (typeof body.body !== 'string' || new TextEncoder().encode(body.body).byteLength > MAX_NETWORK_BODY_BYTES)) throw new Error('Network request body exceeds its limit.')
  if (body.contentType !== undefined && !['application/json', 'application/x-www-form-urlencoded', 'text/plain'].includes(String(body.contentType))) throw new Error('Unsupported request content type.')
  return body as unknown as ZuraExtensionNetworkRequest
}

export async function requestExtensionNetwork(extensionId: unknown, request: unknown): Promise<ZuraExtensionNetworkResponse> {
  const pkg = await requireEnabledPackage(extensionId)
  const safe = validateNetworkRequest(pkg, request)
  const url = new URL(safe.path, `https://${safe.domain}`)
  if (url.protocol !== 'https:' || url.hostname !== safe.domain || url.username || url.password) throw new Error('Invalid extension network target.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: safe.method,
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain;q=0.8', ...(safe.contentType ? { 'Content-Type': safe.contentType } : {}) },
      body: safe.method === 'POST' ? safe.body : undefined,
    })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (reader) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_NETWORK_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Extension network response exceeds 1 MB.') }
      chunks.push(next.value)
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
    return { status: response.status, ok: response.ok, contentType: response.headers.get('content-type')?.slice(0, 160) || undefined, body: new TextDecoder().decode(merged) }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Extension network request timed out.', { cause: error })
    throw error
  } finally { clearTimeout(timer) }
}

export async function pickExtensionFile(extensionId: unknown, kind: unknown): Promise<ZuraExtensionFileHandle | null> {
  const pkg = await requireEnabledPackage(extensionId)
  if (kind !== 'file' && kind !== 'directory') throw new Error('Invalid picker kind.')
  const permission = kind === 'file' ? 'filesystem.file-selection' : 'filesystem.directory-selection'
  if (!pkg.manifest!.permissions.includes(permission)) throw new Error('Extension does not have the required file-selection permission.')
  const result = await dialog.showOpenDialog({ properties: kind === 'file' ? ['openFile'] : ['openDirectory'], title: kind === 'file' ? 'Choose a file for this extension' : 'Choose a folder for this extension' })
  if (result.canceled || !result.filePaths[0]) return null
  const resolved = await fs.realpath(result.filePaths[0])
  const stat = await fs.stat(resolved)
  if ((kind === 'file' && !stat.isFile()) || (kind === 'directory' && !stat.isDirectory())) throw new Error('Selected item has the wrong type.')
  const handle: ZuraExtensionFileHandle = { id: crypto.randomUUID(), name: path.basename(resolved), kind, expiresAt: Date.now() + FILE_HANDLE_TTL_MS }
  fileHandles.set(handle.id, { extensionId: pkg.manifest!.id, path: resolved, kind, expiresAt: handle.expiresAt })
  return handle
}

export async function readExtensionFileHandle(extensionId: unknown, handleId: unknown): Promise<string> {
  const pkg = await requireEnabledPackage(extensionId)
  if (typeof handleId !== 'string') throw new Error('Invalid file handle.')
  const handle = fileHandles.get(handleId)
  if (!handle || handle.extensionId !== pkg.manifest!.id || handle.expiresAt < Date.now()) { fileHandles.delete(handleId); throw new Error('File handle expired or was not found.') }
  if (handle.kind !== 'file') throw new Error('Directory handles cannot be read as files.')
  const stat = await fs.stat(handle.path)
  if (!stat.isFile() || stat.size > MAX_FILE_HANDLE_BYTES) throw new Error('Selected file exceeds the 1 MB text limit.')
  return fs.readFile(handle.path, 'utf8')
}

export function registerExtensionHandlers(): void {
  ipcMain.handle('extensions:list', () => listExtensions())
  ipcMain.handle('extensions:prepare-mutation', (_event, id, action) => prepareExtensionMutation(id, action))
  ipcMain.handle('extensions:apply-mutation', (event, confirmationId) => confirmAndApplyExtensionMutation(confirmationId, BrowserWindow.fromWebContents(event.sender) ?? undefined))
  ipcMain.handle('extensions:set-enabled', (_event, id, enabled) => setExtensionEnabled(id, enabled))
  ipcMain.handle('extensions:import-development', () => importDevelopmentExtension())
  ipcMain.handle('extensions:remove-development', (_event, id) => removeDevelopmentExtension(id))
  ipcMain.handle('extensions:get-view', (_event, id, commandId, viewId) => getExtensionView(id, commandId, viewId))
  ipcMain.handle('extensions:execute-action', (_event, id, commandId, viewId, actionId, values) => executeExtensionAction(id, commandId, viewId, actionId, values))
  ipcMain.handle('extensions:execute-no-view', (_event, id, commandId) => executeNoViewExtensionCommand(id, commandId))
  ipcMain.handle('extensions:get-storage', (_event, id) => getExtensionStorage(id))
  ipcMain.handle('extensions:request-network', (_event, id, request) => requestExtensionNetwork(id, request))
  ipcMain.handle('extensions:pick-file', (_event, id, kind) => pickExtensionFile(id, kind))
  ipcMain.handle('extensions:read-file-handle', (_event, id, handleId) => readExtensionFileHandle(id, handleId))
  void discoverExtensions()
}

export function unregisterExtensionHandlers(): void {
  for (const channel of ['list', 'prepare-mutation', 'apply-mutation', 'set-enabled', 'import-development', 'remove-development', 'get-view', 'execute-action', 'execute-no-view', 'get-storage', 'request-network', 'pick-file', 'read-file-handle']) ipcMain.removeHandler(`extensions:${channel}`)
  stopDevelopmentWatchers()
  confirmations.clear()
  fileHandles.clear()
}

export function __resetExtensionServiceForTests(): void {
  stopDevelopmentWatchers()
  registryLoaded = false
  registry = { version: 1, installed: {}, developmentRoots: [] }
  packages.clear()
  discoveryRequest = null
  confirmations.clear()
  lifecycleHooks.clear()
  fileHandles.clear()
}
