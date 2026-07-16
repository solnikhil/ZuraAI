import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/shared'
import { useSettings } from '../../contexts/SettingsContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useAppShell } from '../../contexts/AppShellContext'
import {
  checkOllamaStatus,
  listOllamaModels,
  enrichOllamaModelsWithContext,
} from '../../services/ollama'
import { SECURE_API_KEY_NAMES, saveApiKeyToSecureStorage } from '../../utils/secureApiKeys'
import { UsageSection } from './sections/UsageSection'
import { McpSection } from './sections/McpSection'
import { ProviderHubSection } from './sections/ProviderHubSection'
import { SkillsSection } from './sections/SkillsSection'
import { AppearanceSection } from './sections/AppearanceSection'

import { computeUsageStats, mergeUsageSessionSnapshots } from './sections/usageMetrics'
import type { ChatSession } from '@/chat/types'
import { normalizeSettingsSection } from '../../constants/settingsSections'

import { getProviderModelListField, getProviderSettingsDefinitions } from '../../providers'

import './Settings.css'

interface SettingsProps {
  activeSection?: string
}

export default function Settings({
  activeSection = 'providers',
}: SettingsProps): React.ReactElement {
  const { settings, updateSettings } = useSettings()
  const { showToast } = useToast()
  const { sessions } = useChatHistory()
  const { settingsSectionParams, setSettingsSectionParams } = useAppShell()

  const secureSaveQueuesRef = useRef(new Map<string, Promise<void>>())
  const pendingSecureValuesRef = useRef(new Map<string, string>())
  const [secureSavesInFlight, setSecureSavesInFlight] = useState(0)
  const [usageStoredSessions, setUsageStoredSessions] = useState<ChatSession[] | null>(null)
  const clearParams = useCallback(() => setSettingsSectionParams(null), [setSettingsSectionParams])

  const normalizedActiveSection = useMemo(() => {
    return normalizeSettingsSection(activeSection) ?? 'providers'
  }, [activeSection])

  const usageModelCatalog = useMemo(() => {
    return Object.fromEntries(
      getProviderSettingsDefinitions().flatMap((provider) => {
        const modelListField = getProviderModelListField(provider.id)
        if (!modelListField) return []
        const usageCatalogKey = provider.id === 'openrouter' ? 'openrouterModels' : modelListField
        const models = (settings[modelListField] || []).map((model) => model.code)
        return [[usageCatalogKey, models]]
      })
    )
  }, [settings])

  const usageSessionSignature = useMemo(
    () =>
      sessions
        .map(
          (session) =>
            `${session.id}:${session.updatedAt}:${session.messageCount ?? session.messages.length}`
        )
        .join('|'),
    [sessions]
  )

  useEffect(() => {
    if (normalizedActiveSection !== 'usage') return
    if (typeof window === 'undefined' || !window.ipcRenderer) {
      setUsageStoredSessions(null)
      return
    }

    let cancelled = false
    void window.ipcRenderer
      .invoke('chat-store:get-usage-sessions')
      .then((storedSessions: ChatSession[]) => {
        if (!cancelled) setUsageStoredSessions(storedSessions)
      })
      .catch((error) => {
        console.error('Failed to load usage chat snapshots:', error)
        if (!cancelled) setUsageStoredSessions(null)
      })

    return () => {
      cancelled = true
    }
  }, [normalizedActiveSection, usageSessionSignature])

  const usageSessions = useMemo(
    () => mergeUsageSessionSnapshots(usageStoredSessions ?? [], sessions),
    [usageStoredSessions, sessions]
  )

  const usageStats = useMemo(
    () => computeUsageStats(usageSessions, usageModelCatalog),
    [usageSessions, usageModelCatalog]
  )

  const handleChange = (changes: Partial<typeof settings>) => {
    updateSettings(changes)

    for (const key of SECURE_API_KEY_NAMES) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue

      pendingSecureValuesRef.current.set(key, changes[key] ?? '')
      if (secureSaveQueuesRef.current.has(key)) continue

      setSecureSavesInFlight((count) => count + 1)

      const nextSave = (async () => {
        while (pendingSecureValuesRef.current.has(key)) {
          const value = pendingSecureValuesRef.current.get(key) ?? ''
          pendingSecureValuesRef.current.delete(key)
          const saved = await saveApiKeyToSecureStorage(key, value)
          if (!saved) throw new Error(`Could not securely store ${key}.`)
        }
      })()
        .catch((error) => {
          pendingSecureValuesRef.current.delete(key)
          console.error(`[Settings] Failed to save ${key}:`, error)
          showToast('A secure setting could not be saved. Try entering it again.', 'error')
        })
        .finally(() => {
          setSecureSavesInFlight((count) => Math.max(0, count - 1))
          if (secureSaveQueuesRef.current.get(key) === nextSave) {
            secureSaveQueuesRef.current.delete(key)
          }
        })

      secureSaveQueuesRef.current.set(key, nextSave)
    }
  }

  const checkOllama = async () => {
    const connected = await checkOllamaStatus(settings.ollamaUrl)
    if (connected) {
      const models = await listOllamaModels(settings.ollamaUrl)
      if (models.length > 0) {
        const formatted = models.map((m) => ({
          code: m.name,
          displayName: `${m.name} (${m.details.parameter_size})`,
        }))
        const enriched = await enrichOllamaModelsWithContext(settings.ollamaUrl, formatted)
        handleChange({ ollamaModels: enriched })
      }
    }
  }

  useEffect(() => {
    if (settings.modelProvider === 'ollama') void checkOllama()
  }, [settings.modelProvider, settings.ollamaUrl])

  return (
    <div className="settings-container">
      <ScrollArea
        className="settings-main-col"
        viewportClassName="settings-main-col__viewport"
        viewportStyle={{ paddingBottom: 24 }}
      >
        <div className="settings-shell">
          <div className="settings-shell__content">
            {normalizedActiveSection === 'providers' && (
              <ProviderHubSection
                initialProvider={settingsSectionParams?.provider}
                initialManageMode={settingsSectionParams?.manageMode}
                onParamsConsumed={clearParams}
                alibabaApiKey={settings.alibabaApiKey}
                alibabaRegion={settings.alibabaRegion}
                deepseekApiKey={settings.deepseekApiKey}
                opencodeGoApiKey={settings.opencodeGoApiKey}
                fireworksApiKey={settings.fireworksApiKey}
                nvidiaApiKey={settings.nvidiaApiKey}
                groqApiKey={settings.groqApiKey}
                openRouterApiKey={settings.openRouterApiKey}
                tavilyApiKey={settings.tavilyApiKey}
                onlineCompilerApiKey={settings.onlineCompilerApiKey}
                tavilySearchDepthPreference={settings.tavilySearchDepthPreference}
                webSearchIncludeImages={settings.webSearchIncludeImages}
                ollamaUrl={settings.ollamaUrl}
                aiModel={settings.aiModel}
                modelProvider={settings.modelProvider}
                providerEnabled={settings.providerEnabled}
                configuredModels={settings.configuredModels}
                alibabaModels={settings.alibabaModels}
                codexModels={settings.codexModels}
                deepseekModels={settings.deepseekModels}
                opencodeModels={settings.opencodeModels}
                fireworksModels={settings.fireworksModels}
                nvidiaModels={settings.nvidiaModels}
                groqModels={settings.groqModels}
                ollamaModels={settings.ollamaModels}
                maxTokens={settings.maxTokens}
                deepseekReasoning={settings.deepseekReasoning}
                deepseekLastEffort={settings.deepseekLastEffort}
                onChange={handleChange}
              />
            )}

            {normalizedActiveSection === 'extensions' && (
              <SkillsSection
                skills={settings.extensions}
                settings={settings}
                brevoApiKey={settings.brevoApiKey}
                emailNotifications={settings.emailNotifications}
                isSavingSecureSettings={secureSavesInFlight > 0}
                activeExtension={settingsSectionParams?.extension ?? null}
                activeExtensionPanel={settingsSectionParams?.extensionPanel}
                onActiveExtensionChange={(extension, panel) => {
                  if (extension) {
                    setSettingsSectionParams({
                      extension,
                      ...(panel ? { extensionPanel: panel } : {}),
                    })
                    return
                  }
                  clearParams()
                }}
                onChange={(changes) =>
                  handleChange({
                    ...changes,
                    ...(changes.skills ? { extensions: changes.skills } : {}),
                  })
                }
              />
            )}

            {normalizedActiveSection === 'mcp' && <McpSection />}

            {normalizedActiveSection === 'themes' && (
              <AppearanceSection
                settings={settings}
                onChange={(changes) => handleChange(changes)}
                initialCommandPaletteTab={settingsSectionParams?.commandPaletteTab}
                onParamsConsumed={clearParams}
              />
            )}

            {normalizedActiveSection === 'usage' && <UsageSection stats={usageStats} />}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
