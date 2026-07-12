export const ZURA_EXTENSION_SCHEMA_VERSION = 1 as const

export type ZuraExtensionCommandMode = 'view' | 'no-view' | 'workspace'
export type ZuraExtensionPlatform = 'windows' | 'macos' | 'linux'
export type ZuraExtensionTrust = 'reviewed' | 'community' | 'development'

export interface ZuraExtensionCommandManifest {
  id: string
  title: string
  description?: string
  mode: ZuraExtensionCommandMode
  entry: string
  keywords: string[]
}

export interface ZuraExtensionManifest {
  schemaVersion: 1
  id: string
  name: string
  publisher: string
  version: string
  description: string
  icon: string
  platforms: ZuraExtensionPlatform[]
  categories: string[]
  commands: ZuraExtensionCommandManifest[]
  permissions: string[]
  capabilities?: { host: string[] }
  networkDomains?: string[]
  privacy?: { dataLeavesDevice: boolean; policyUrl?: string }
  changelog?: string
}

export type ZuraExtensionAction =
  | { id: string; title: string; kind: 'navigate'; viewId: string; destructive?: boolean }
  | {
      id: string
      title: string
      kind: 'storage.set'
      key: string
      value?: string
      valueFromField?: string
      nextViewId?: string
      destructive?: boolean
    }
  | { id: string; title: string; kind: 'storage.remove'; key: string; nextViewId?: string; destructive?: boolean }
  | { id: string; title: string; kind: 'noop'; destructive?: boolean }

export interface ZuraExtensionListItem {
  id: string
  title: string
  subtitle?: string
  detail?: string
  keywords?: string[]
  actions?: ZuraExtensionAction[]
}

export interface ZuraExtensionListSection {
  id: string
  title?: string
  items: ZuraExtensionListItem[]
}

export type ZuraExtensionFormField =
  | { id: string; type: 'text' | 'password' | 'textarea'; title: string; placeholder?: string; required?: boolean; maxLength?: number }
  | { id: string; type: 'checkbox'; title: string; defaultValue?: boolean }
  | { id: string; type: 'select'; title: string; required?: boolean; options: Array<{ value: string; title: string }> }

export type ZuraExtensionView =
  | { id: string; kind: 'list'; title: string; searchPlaceholder?: string; sections: ZuraExtensionListSection[]; empty?: { title: string; description?: string } }
  | { id: string; kind: 'detail'; title: string; markdown: string; actions?: ZuraExtensionAction[] }
  | { id: string; kind: 'form'; title: string; fields: ZuraExtensionFormField[]; actions: ZuraExtensionAction[] }
  | { id: string; kind: 'empty'; title: string; description?: string; actions?: ZuraExtensionAction[] }
  | { id: string; kind: 'loading'; title: string; description?: string }
  | { id: string; kind: 'progress'; title: string; description?: string; value?: number }
  | { id: string; kind: 'error'; title: string; description: string; actions?: ZuraExtensionAction[] }

export interface ZuraExtensionViewDocument {
  schemaVersion: 1
  rootViewId: string
  views: Record<string, ZuraExtensionView>
}

export interface ZuraExtensionSummary {
  manifest: ZuraExtensionManifest
  trust: ZuraExtensionTrust
  installed: boolean
  enabled: boolean
  installedVersion?: string
  updateAvailable: boolean
  source: 'bundled' | 'development'
  validationErrors: string[]
  iconDataUrl?: string
  changelogText?: string
}

export interface ZuraExtensionMutationReview {
  confirmationId: string
  action: 'install' | 'update' | 'uninstall'
  extension: ZuraExtensionSummary
  addedPermissions: string[]
  expiresAt: number
}

export interface ZuraExtensionActionResult {
  ok: boolean
  view?: ZuraExtensionView
  storageChanged?: boolean
  error?: string
}

export interface ZuraExtensionNetworkRequest {
  domain: string
  path: string
  method: 'GET' | 'POST'
  body?: string
  contentType?: 'application/json' | 'application/x-www-form-urlencoded' | 'text/plain'
}

export interface ZuraExtensionNetworkResponse {
  status: number
  ok: boolean
  contentType?: string
  body: string
}

export interface ZuraExtensionFileHandle {
  id: string
  name: string
  kind: 'file' | 'directory'
  expiresAt: number
}

export interface ZuraExtensionAgentRequest {
  id: string
  operation:
    | 'extension_create'
    | 'extension_validate'
    | 'extension_preview'
    | 'extension_get_errors'
    | 'extension_run_tests'
    | 'extension_pack'
    | 'extension_request_install'
    | 'extension_request_publish'
  status: 'prepared' | 'requires_user_approval' | 'completed' | 'failed'
  extensionId?: string
  error?: string
}

export interface ZuraExtensionsApi {
  list: () => Promise<ZuraExtensionSummary[]>
  prepareMutation: (extensionId: string, action: 'install' | 'update' | 'uninstall') => Promise<ZuraExtensionMutationReview>
  applyMutation: (confirmationId: string) => Promise<ZuraExtensionSummary[]>
  setEnabled: (extensionId: string, enabled: boolean) => Promise<ZuraExtensionSummary[]>
  importDevelopment: () => Promise<ZuraExtensionSummary[]>
  removeDevelopment: (extensionId: string) => Promise<ZuraExtensionSummary[]>
  getView: (extensionId: string, commandId: string, viewId?: string) => Promise<ZuraExtensionView>
  executeAction: (extensionId: string, commandId: string, viewId: string, actionId: string, values?: Record<string, string | boolean>) => Promise<ZuraExtensionActionResult>
  executeNoView: (extensionId: string, commandId: string) => Promise<ZuraExtensionActionResult>
  getStorage: (extensionId: string) => Promise<Record<string, string | boolean>>
  requestNetwork: (extensionId: string, request: ZuraExtensionNetworkRequest) => Promise<ZuraExtensionNetworkResponse>
  pickFile: (extensionId: string, kind: 'file' | 'directory') => Promise<ZuraExtensionFileHandle | null>
  readFileHandle: (extensionId: string, handleId: string) => Promise<string>
  onChanged: (callback: () => void) => () => void
}
