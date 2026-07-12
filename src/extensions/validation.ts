import {
  ZURA_EXTENSION_SCHEMA_VERSION,
  type ZuraExtensionAction,
  type ZuraExtensionManifest,
  type ZuraExtensionView,
  type ZuraExtensionViewDocument,
} from './types'

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/
const COMMAND_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const SAFE_ENTRY_RE = /^(?:ui\/[a-zA-Z0-9._/-]+\.json|host:[a-z0-9-]+)$/
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_VIEW_BYTES = 512 * 1024
const MAX_COMMANDS = 32
const MAX_PERMISSIONS = 64
const MAX_VIEWS = 64
const MAX_ITEMS = 500
const MAX_FORM_FIELDS = 64
const STANDARD_PERMISSIONS = new Set(['storage.local', 'filesystem.file-selection', 'filesystem.directory-selection'])
const PRODUCT_PERMISSIONS = new Set(['github.account', 'git.repositories', 'filesystem.repository-selection'])

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const bounded = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const strings = (value: unknown, maxItems: number, maxLength = 128): value is string[] => Array.isArray(value) && value.length <= maxItems && value.every((item) => bounded(item, maxLength))
const hasTraversal = (value: string) => value.includes('\\') || value.split('/').some((part) => part === '..' || part === '')

export function parseExtensionManifestText(text: string): { manifest?: ZuraExtensionManifest; errors: string[] } {
  if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES) return { errors: ['Manifest exceeds 64 KB.'] }
  try { return validateExtensionManifest(JSON.parse(text)) } catch { return { errors: ['Manifest is not valid JSON.'] } }
}

export function validateExtensionManifest(value: unknown): { manifest?: ZuraExtensionManifest; errors: string[] } {
  const errors: string[] = []
  if (!isObject(value)) return { errors: ['Manifest must be an object.'] }
  if (value.schemaVersion !== ZURA_EXTENSION_SCHEMA_VERSION) errors.push('Unsupported schemaVersion.')
  if (!bounded(value.id, 128) || !ID_RE.test(value.id)) errors.push('id must be a reverse-domain identifier.')
  if (!bounded(value.name, 80)) errors.push('name is required and must be at most 80 characters.')
  if (!bounded(value.publisher, 80)) errors.push('publisher is required and must be at most 80 characters.')
  if (!bounded(value.version, 40) || !VERSION_RE.test(value.version)) errors.push('version must be semantic versioning.')
  if (!bounded(value.description, 240)) errors.push('description is required and must be at most 240 characters.')
  if (!bounded(value.icon, 240) || hasTraversal(value.icon) || /^([a-z]+:|\/)/i.test(value.icon)) errors.push('icon must be a package-relative path.')
  if (!strings(value.platforms, 3, 16) || value.platforms.some((item) => !['windows', 'macos', 'linux'].includes(item))) errors.push('platforms contains an unsupported platform.')
  if (!strings(value.categories, 8, 40)) errors.push('categories must contain at most 8 labels.')
  if (!strings(value.permissions, MAX_PERMISSIONS, 160)) errors.push('permissions must contain at most 64 bounded values.')
  if (!Array.isArray(value.commands) || value.commands.length < 1 || value.commands.length > MAX_COMMANDS) {
    errors.push('commands must contain between 1 and 32 commands.')
  } else {
    const ids = new Set<string>()
    for (const command of value.commands) {
      if (!isObject(command) || !bounded(command.id, 64) || !COMMAND_ID_RE.test(command.id)) { errors.push('Each command requires a valid id.'); continue }
      if (ids.has(command.id)) errors.push(`Duplicate command id: ${command.id}.`)
      ids.add(command.id)
      if (!bounded(command.title, 80)) errors.push(`Command ${command.id} requires a title.`)
      if (command.description !== undefined && (typeof command.description !== 'string' || command.description.length > 160)) errors.push(`Command ${command.id} has an invalid description.`)
      if (!['view', 'no-view', 'workspace'].includes(String(command.mode))) errors.push(`Command ${command.id} has an invalid mode.`)
      if (!bounded(command.entry, 240) || !SAFE_ENTRY_RE.test(command.entry) || (command.entry.startsWith('ui/') && hasTraversal(command.entry))) errors.push(`Command ${command.id} has an invalid entry.`)
      if (!strings(command.keywords, 32, 64)) errors.push(`Command ${command.id} has invalid keywords.`)
    }
  }
  if (value.networkDomains !== undefined && (!strings(value.networkDomains, 32, 253) || value.networkDomains.some((domain) => !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)))) errors.push('networkDomains must contain HTTPS hostnames only.')
  const permissions = Array.isArray(value.permissions) ? value.permissions.filter((item): item is string => typeof item === 'string') : []
  const domains = Array.isArray(value.networkDomains) ? value.networkDomains.filter((item): item is string => typeof item === 'string') : []
  for (const permission of permissions) {
    if (!STANDARD_PERMISSIONS.has(permission) && !PRODUCT_PERMISSIONS.has(permission) && !permission.startsWith('network.')) errors.push(`Unsupported permission: ${permission}.`)
    if (permission.startsWith('network.') && !domains.includes(permission.slice('network.'.length))) errors.push(`Network permission ${permission} requires a matching declared domain.`)
  }
  for (const domain of domains) if (!permissions.includes(`network.${domain}`)) errors.push(`Declared domain ${domain} requires network.${domain} permission.`)
  if (value.changelog !== undefined && (!bounded(value.changelog, 240) || hasTraversal(value.changelog) || !/^[a-zA-Z0-9._/-]+\.md$/.test(value.changelog))) errors.push('changelog must be a package-relative Markdown path.')
  if (value.privacy !== undefined && (!isObject(value.privacy) || typeof value.privacy.dataLeavesDevice !== 'boolean' || (value.privacy.policyUrl !== undefined && (typeof value.privacy.policyUrl !== 'string' || !/^https:\/\//.test(value.privacy.policyUrl) || value.privacy.policyUrl.length > 500)))) errors.push('privacy must declare dataLeavesDevice and an optional HTTPS policy URL.')
  if (value.capabilities !== undefined) {
    if (!isObject(value.capabilities) || !strings(value.capabilities.host, 8, 64) || value.capabilities.host.some((capability) => capability !== 'git-workspace')) errors.push('capabilities.host contains an unsupported host capability.')
    else for (const command of Array.isArray(value.commands) ? value.commands : []) if (isObject(command) && typeof command.entry === 'string' && command.entry.startsWith('host:') && !value.capabilities.host.includes(command.entry.slice(5))) errors.push(`Command ${String(command.id)} requires its declared host capability.`)
  } else if (Array.isArray(value.commands) && value.commands.some((command) => isObject(command) && typeof command.entry === 'string' && command.entry.startsWith('host:'))) errors.push('Host commands require capabilities.host.')
  if (errors.length) return { errors }
  return { manifest: value as unknown as ZuraExtensionManifest, errors }
}

function validateAction(action: unknown, viewIds: Set<string>, errors: string[], context: string): action is ZuraExtensionAction {
  if (!isObject(action) || !bounded(action.id, 64) || !COMMAND_ID_RE.test(action.id) || !bounded(action.title, 80)) { errors.push(`${context} contains an invalid action.`); return false }
  if (!['navigate', 'storage.set', 'storage.remove', 'noop'].includes(String(action.kind))) { errors.push(`${context} action ${action.id} has an unsupported kind.`); return false }
  if (action.kind === 'navigate' && (!bounded(action.viewId, 64) || !viewIds.has(action.viewId))) errors.push(`${context} action ${action.id} targets an unknown view.`)
  if ((action.kind === 'storage.set' || action.kind === 'storage.remove') && (!bounded(action.key, 80) || !COMMAND_ID_RE.test(action.key))) errors.push(`${context} action ${action.id} has an invalid storage key.`)
  if (action.kind === 'storage.set') {
    if (action.value !== undefined && (typeof action.value !== 'string' || action.value.length > 10_000)) errors.push(`${context} action ${action.id} has an invalid value.`)
    if (action.valueFromField !== undefined && (!bounded(action.valueFromField, 64) || !COMMAND_ID_RE.test(action.valueFromField))) errors.push(`${context} action ${action.id} has an invalid form field reference.`)
    if (action.value === undefined && action.valueFromField === undefined) errors.push(`${context} action ${action.id} requires a value or form field.`)
  }
  if ('nextViewId' in action && action.nextViewId !== undefined && (!bounded(action.nextViewId, 64) || !viewIds.has(action.nextViewId))) errors.push(`${context} action ${action.id} targets an unknown next view.`)
  return true
}

function validateFormField(field: unknown, ids: Set<string>, errors: string[], context: string): void {
  if (!isObject(field) || !bounded(field.id, 64) || !COMMAND_ID_RE.test(field.id) || !bounded(field.title, 100)) { errors.push(`${context} contains an invalid form field.`); return }
  if (ids.has(field.id)) errors.push(`${context} contains duplicate field ${field.id}.`)
  ids.add(field.id)
  if (!['text', 'password', 'textarea', 'checkbox', 'select'].includes(String(field.type))) { errors.push(`${context} field ${field.id} has an unsupported type.`); return }
  if (field.placeholder !== undefined && (typeof field.placeholder !== 'string' || field.placeholder.length > 240)) errors.push(`${context} field ${field.id} has an invalid placeholder.`)
  if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || Number(field.maxLength) < 1 || Number(field.maxLength) > 10_000)) errors.push(`${context} field ${field.id} has an invalid maxLength.`)
  if (field.type === 'select') {
    if (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > 100) errors.push(`${context} field ${field.id} requires 1 to 100 options.`)
    else {
      const values = new Set<string>()
      for (const option of field.options) {
        if (!isObject(option) || !bounded(option.value, 160) || !bounded(option.title, 160) || values.has(option.value)) errors.push(`${context} field ${field.id} has an invalid or duplicate option.`)
        else values.add(option.value)
      }
    }
  }
}

export function parseExtensionViewText(text: string): { document?: ZuraExtensionViewDocument; errors: string[] } {
  if (new TextEncoder().encode(text).byteLength > MAX_VIEW_BYTES) return { errors: ['View document exceeds 512 KB.'] }
  let value: unknown
  try { value = JSON.parse(text) } catch { return { errors: ['View document is not valid JSON.'] } }
  const errors: string[] = []
  if (!isObject(value) || value.schemaVersion !== 1 || !bounded(value.rootViewId, 64) || !isObject(value.views)) return { errors: ['View document has an invalid root shape.'] }
  const entries = Object.entries(value.views)
  if (entries.length < 1 || entries.length > MAX_VIEWS) errors.push('View document must contain between 1 and 64 views.')
  const viewIds = new Set(entries.map(([id]) => id))
  if (!viewIds.has(value.rootViewId)) errors.push('rootViewId does not exist.')
  let itemCount = 0
  for (const [id, raw] of entries) {
    if (!COMMAND_ID_RE.test(id) || !isObject(raw) || raw.id !== id || !bounded(raw.title, 100)) { errors.push(`View ${id} is invalid.`); continue }
    if (!['list', 'detail', 'form', 'empty', 'loading', 'progress', 'error'].includes(String(raw.kind))) { errors.push(`View ${id} has an unsupported kind.`); continue }
    const actions: unknown[] = []
    if (Array.isArray(raw.actions)) actions.push(...raw.actions)
    if (raw.kind === 'list') {
      if (!Array.isArray(raw.sections)) errors.push(`List ${id} requires sections.`)
      else for (const section of raw.sections) {
        if (!isObject(section) || !bounded(section.id, 64) || !Array.isArray(section.items)) { errors.push(`List ${id} has an invalid section.`); continue }
        itemCount += section.items.length
        for (const item of section.items) {
          if (!isObject(item) || !bounded(item.id, 80) || !bounded(item.title, 160)) errors.push(`List ${id} has an invalid item.`)
          else if (Array.isArray(item.actions)) actions.push(...item.actions)
        }
      }
    }
    if (raw.kind === 'form') {
      if (!Array.isArray(raw.fields) || raw.fields.length > MAX_FORM_FIELDS || !Array.isArray(raw.actions) || raw.actions.length < 1) errors.push(`Form ${id} requires at most 64 fields and at least one action.`)
      else {
        const fieldIds = new Set<string>()
        raw.fields.forEach((field) => validateFormField(field, fieldIds, errors, `Form ${id}`))
        for (const action of raw.actions) if (isObject(action) && action.kind === 'storage.set' && typeof action.valueFromField === 'string' && !fieldIds.has(action.valueFromField)) errors.push(`Form ${id} action references an unknown field.`)
      }
    }
    actions.forEach((action) => validateAction(action, viewIds, errors, `View ${id}`))
  }
  if (itemCount > MAX_ITEMS) errors.push('View document exceeds 500 list items.')
  if (errors.length) return { errors }
  return { document: value as unknown as ZuraExtensionViewDocument, errors }
}

export function findViewAction(view: ZuraExtensionView, actionId: string): ZuraExtensionAction | undefined {
  const actions = 'actions' in view && Array.isArray(view.actions) ? view.actions : []
  if (view.kind === 'list') {
    for (const section of view.sections) for (const item of section.items) {
      const action = item.actions?.find((candidate) => candidate.id === actionId)
      if (action) return action
    }
  }
  return actions.find((action) => action.id === actionId)
}

