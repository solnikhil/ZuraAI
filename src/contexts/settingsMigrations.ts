export const SETTINGS_SCHEMA_VERSION = 3

export type StoredSettingsRecord = Record<string, unknown> & {
  settingsSchemaVersion?: number
}

export interface SettingsMigration {
  from: number
  to: number
  migrate: (settings: StoredSettingsRecord) => StoredSettingsRecord
}

const LEGACY_MODEL_ID_MAP: Record<string, string> = {
  'accounts/fireworks/models/kimi-k2p5-turbo': 'accounts/fireworks/routers/kimi-k2p5-turbo',
  'accounts/fireworks/models/kimi-k2p5-turbo-instruct':
    'accounts/fireworks/routers/kimi-k2p5-turbo',
  'kimi-k2.7': 'kimi-k2.7-code',
}

const LEGACY_GROQ_MODEL_ID_MAP: Record<string, string> = {
  'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
  'deepseek-r1-distill-llama-70b': 'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768': 'llama-3.1-8b-instant',
  'gemma2-9b-it': 'llama-3.1-8b-instant',
}

const MODEL_LIST_FIELDS = [
  'configuredModels',
  'codexModels',
  'groqModels',
  'alibabaModels',
  'deepseekModels',
  'opencodeModels',
  'fireworksModels',
  'nvidiaModels',
  'ollamaModels',
] as const

const LEGACY_SELECTED_CHAT_STYLE_MAP: Record<string, string> = {
  pill: 'linear',
  soft: 'notion',
  outline: 'github',
  glow: 'slack',
}

function withoutKeys(settings: StoredSettingsRecord, keys: string[]): StoredSettingsRecord {
  const next = { ...settings }
  for (const key of keys) delete next[key]
  return next
}

function migrateModelCode(model: unknown): unknown {
  if (typeof model !== 'object' || model === null || Array.isArray(model)) return model
  const record = model as Record<string, unknown>
  if (typeof record.code !== 'string') return model
  const code = LEGACY_MODEL_ID_MAP[record.code]
  return code ? { ...record, code } : model
}

const migrateV0ToV1: SettingsMigration = {
  from: 0,
  to: 1,
  migrate: (settings) =>
    withoutKeys(settings, [
      'autoHideOverlay',
      'overlayTransparency',
      'loadOverlayOnStartup',
      'shortcuts',
      'overlay',
      'buddyOverlay',
    ]),
}

const migrateV1ToV2: SettingsMigration = {
  from: 1,
  to: 2,
  migrate: (settings) => {
    const next = { ...settings }
    if (typeof next.aiModel === 'string') {
      next.aiModel =
        LEGACY_MODEL_ID_MAP[next.aiModel] ??
        (next.modelProvider === 'groq' ? LEGACY_GROQ_MODEL_ID_MAP[next.aiModel] : undefined) ??
        next.aiModel
    }
    for (const field of MODEL_LIST_FIELDS) {
      if (Array.isArray(next[field])) {
        next[field] = next[field].map(migrateModelCode)
      }
    }
    return next
  },
}

const migrateV2ToV3: SettingsMigration = {
  from: 2,
  to: 3,
  migrate: (settings) => {
    const legacySoftenedContrast = settings.softenedContrast === true
    const next = withoutKeys(settings, [
      'themeAccent',
      'themeBackground',
      'themeForeground',
      'frostedSidebar',
      'frostedPrompt',
      'sidebarAutoHideOnResize',
      'softenedContrast',
      'notificationsEnabled',
      'nativeNotificationsEnabled',
      'toastDuration',
      'doNotDisturb',
      'responseTransitionMode',
      'modelSelector',
      'favoriteModels',
      'codeExecutionAutoApprove',
      'terminalAutoApprove',
      'computerUseAutoApprove',
    ])
    if (next.themeContrast === undefined && legacySoftenedContrast) next.themeContrast = 85
    if (next.assistantMode === 'research') next.assistantMode = 'chat'
    if (typeof next.chatSelectedOverlayStyle === 'string') {
      next.chatSelectedOverlayStyle =
        LEGACY_SELECTED_CHAT_STYLE_MAP[next.chatSelectedOverlayStyle] ??
        next.chatSelectedOverlayStyle
    }
    return next
  },
}

export const SETTINGS_MIGRATIONS: readonly SettingsMigration[] = [
  migrateV0ToV1,
  migrateV1ToV2,
  migrateV2ToV3,
]

export function migrateStoredSettingsRecord(settings: StoredSettingsRecord): StoredSettingsRecord {
  let current = { ...settings }
  let version =
    typeof current.settingsSchemaVersion === 'number' &&
    Number.isInteger(current.settingsSchemaVersion) &&
    current.settingsSchemaVersion >= 0
      ? current.settingsSchemaVersion
      : 0

  if (version > SETTINGS_SCHEMA_VERSION) return removeRetiredRendererAuthoritySettings(current)

  while (version < SETTINGS_SCHEMA_VERSION) {
    const migration = SETTINGS_MIGRATIONS.find((candidate) => candidate.from === version)
    if (!migration) {
      throw new Error(`Missing settings migration from schema version ${version}`)
    }
    current = migration.migrate(current)
    version = migration.to
    current.settingsSchemaVersion = version
  }

  return removeRetiredRendererAuthoritySettings(current)
}

function removeRetiredRendererAuthoritySettings(
  settings: StoredSettingsRecord
): StoredSettingsRecord {
  return withoutKeys(settings, [
    'codeExecutionAutoApprove',
    'terminalAutoApprove',
    'computerUseAutoApprove',
  ])
}

export function migrateLegacyConfiguredModelCode<T extends { code: string; displayName?: string }>(
  model: T
): T {
  const mappedCode = LEGACY_MODEL_ID_MAP[model.code]
  if (!mappedCode) return model
  return { ...model, code: mappedCode }
}
