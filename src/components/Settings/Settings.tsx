import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '../../contexts/SettingsContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useAppShell } from '../../contexts/AppShellContext'
import { useMcp } from '../../mcp/McpContext'
import { checkOllamaStatus, listOllamaModels, enrichOllamaModelsWithContext } from '../../services/ollama'
import { SECURE_API_KEY_NAMES, saveApiKeyToSecureStorage } from '../../utils/secureApiKeys'
import { UsageSection } from './sections/UsageSection'
import { OverlaySection } from './sections/OverlaySection'
import { McpSection } from './sections/McpSection'
import { MemorySection } from './sections/MemorySection'
import { ProviderHubSection } from './sections/ProviderHubSection'
import { SkillsSection } from './sections/SkillsSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { SystemPromptSection } from './sections/SystemPromptSection'
import { ResourceMonitorSection } from './sections/ResourceMonitorSection'

import { computeUsageStats, mergeUsageSessionSnapshots } from './sections/usageMetrics'
import type { ChatSession } from '@/chat/types'
import { normalizeSettingsSection } from '../../constants/settingsSections'
import { isMacOSRuntime } from '../../utils/platform'
import { getProviderModelListField, getProviderSettingsDefinitions } from '../../providers'

import './Settings.css'

interface SettingsProps {
  activeSection?: string
  onUnsavedChange?: (hasChanges: boolean) => void
  showWarning?: boolean
}

export default function Settings({
  activeSection = 'providers', onUnsavedChange, showWarning = false
}: SettingsProps): React.ReactElement {
  const { settings, updateSettings } = useSettings()
  const { discardDraft: discardMcpDraft, hasDraftChanges: hasMcpChanges, saveDraft: saveMcpDraft } = useMcp()
  const { sessions } = useChatHistory()
  const {
    settingsSectionParams,
    setSettingsSectionParams,
  } = useAppShell()

  const [pendingSettings, setPendingSettings] = useState(settings)
  const lastSyncedSettingsRef = useRef(settings)
  const touchedSecureKeysRef = useRef(new Set<string>())
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [usageStoredSessions, setUsageStoredSessions] = useState<ChatSession[] | null>(null)
  const clearParams = useCallback(() => setSettingsSectionParams(null), [setSettingsSectionParams])

  const normalizedActiveSection = useMemo(() => {
    const normalized = normalizeSettingsSection(activeSection) ?? 'providers'
    return isMacOSRuntime() && normalized === 'overlay'
      ? 'providers'
      : normalized
  }, [activeSection])

  const usageModelCatalog = useMemo(() => {
    return Object.fromEntries(
      getProviderSettingsDefinitions().flatMap((provider) => {
        const modelListField = getProviderModelListField(provider.id)
        if (!modelListField) return []
        const usageCatalogKey = provider.id === 'openrouter' ? 'openrouterModels' : modelListField
        const models = (pendingSettings[modelListField] || []).map((model) => model.code)
        return [[usageCatalogKey, models]]
      })
    )
  }, [pendingSettings])

  const usageSessionSignature = useMemo(
    () =>
      sessions
        .map((session) => `${session.id}:${session.updatedAt}:${session.messageCount ?? session.messages.length}`)
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
      .invoke('chat-store:get-all')
      .then((storedSessions: ChatSession[]) => {
        if (!cancelled) setUsageStoredSessions(storedSessions)
      })
      .catch((error) => {
        console.error('Failed to load full chat history for usage metrics:', error)
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

  const usageStats = useMemo(() => computeUsageStats(usageSessions, usageModelCatalog), [usageSessions, usageModelCatalog])

  const handleExportUsageSnapshot = useCallback(() => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      privacy: {
        localOnlyComputation: true,
        includesPromptsOrResponses: false,
        includesApiKeys: false,
      },
      usage: usageStats,
    }

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zura-usage-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [usageStats])

  const handleExportWebSearchCsv = useCallback(() => {
    const rows: string[] = []
    rows.push('total_searches,successful_searches,failed_searches,success_rate_percent,avg_execution_ms')
    rows.push([
      usageStats.totalWebSearches,
      usageStats.successfulWebSearches,
      usageStats.failedWebSearches,
      usageStats.webSearchSuccessRate,
      usageStats.avgWebSearchExecutionMs,
    ].join(','))

    if (usageStats.topSearchQueries.length > 0) {
      rows.push('')
      rows.push('query,count')
      for (const entry of usageStats.topSearchQueries) {
        const escapedQuery = `"${entry.query.replace(/"/g, '""')}"`
        rows.push(`${escapedQuery},${entry.count}`)
      }
    }

    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zura-web-searches-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [usageStats])

  const handleChange = (changes: Partial<typeof settings>) =>
    setPendingSettings((prev) => {
      for (const key of SECURE_API_KEY_NAMES) {
        if (Object.prototype.hasOwnProperty.call(changes, key) && prev[key] !== changes[key]) {
          touchedSecureKeysRef.current.add(key)
        }
      }

      return { ...prev, ...changes }
    })

  const savePendingSettings = async (): Promise<{ allSaved: boolean; failedKeys: string[] }> => {
    let allSaved = true
    const failedKeys: string[] = []
    try {
      for (const key of SECURE_API_KEY_NAMES) {
        if (!touchedSecureKeysRef.current.has(key)) continue
        const current = pendingSettings[key]
        const success = await saveApiKeyToSecureStorage(key, current)
        if (!success) { failedKeys.push(key); allSaved = false }
      }
      if (failedKeys.length > 0) console.warn('[Settings] Failed to save some API keys:', failedKeys.join(', '))
    } catch (error) {
      console.error('[Settings] Failed to save API keys to secure storage:', error)
      allSaved = false
    }

    updateSettings(pendingSettings)

    if (allSaved) {
      touchedSecureKeysRef.current.clear()
    } else {
      for (const key of SECURE_API_KEY_NAMES) {
        if (!failedKeys.includes(key)) {
          touchedSecureKeysRef.current.delete(key)
        }
      }
    }

    return { allSaved, failedKeys }
  }

  const saveChanges = async () => {
    if (isSaving) return

    setIsSaving(true)
    setStatusMessage('Saving settings...')

    let allSaved = true
    let failedKeys: string[] = []

    try {
      if (hasSettingsChanges) {
        const settingsResult = await savePendingSettings()
        allSaved = settingsResult.allSaved
        failedKeys = settingsResult.failedKeys
      }

      if (hasMcpChanges) {
        await saveMcpDraft()
      }

if (!hasSettingsChanges && !hasMcpChanges) {
         setStatusMessage('No changes to save.')
       } else if (!allSaved && failedKeys.length > 0) {
         console.warn('[Settings] Some API keys may not have been saved')
         setStatusMessage('Saved. Some API keys could not be stored securely.')
       } else {
         setStatusMessage('Settings saved.')
       }
    } catch (error) {
      console.error('[Settings] Failed to save changes:', error)
      setStatusMessage(
        error instanceof Error ? `Failed to save changes: ${error.message}` : 'Failed to save changes.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const cancelChanges = () => {
    if (isSaving) return

    if (hasSettingsChanges) {
      setPendingSettings(settings)
    }
    touchedSecureKeysRef.current.clear()
    if (hasMcpChanges) {
      discardMcpDraft()
    }

    setStatusMessage('Changes discarded.')
  }

  const ollamaModelsMatchUserIntent = (a: typeof settings.ollamaModels, b: typeof settings.ollamaModels) => {
    const aMap = new Map((a || []).map(m => [m.code, m.enabled]))
    const bMap = new Map((b || []).map(m => [m.code, m.enabled]))
    const commonCodes = [...aMap.keys()].filter(c => bMap.has(c))
    for (const code of commonCodes) {
      if (aMap.get(code) !== bMap.get(code)) return false
    }
    return true
  }
  const withoutOllamaModels = (s: typeof settings) => {
    const { ollamaModels: _om, ...rest } = s
    return rest
  }
  const baseChanged = JSON.stringify(withoutOllamaModels(pendingSettings)) !== JSON.stringify(withoutOllamaModels(settings))
  const ollamaEnabledChanged = !ollamaModelsMatchUserIntent(pendingSettings.ollamaModels, settings.ollamaModels)
  const hasSettingsChanges = baseChanged || ollamaEnabledChanged
  const hasChanges = hasSettingsChanges || hasMcpChanges

  useEffect(() => {
    setPendingSettings((previousDraft) => {
      const hadLocalDraftChanges = JSON.stringify(previousDraft) !== JSON.stringify(lastSyncedSettingsRef.current)
      lastSyncedSettingsRef.current = settings
      return hadLocalDraftChanges ? previousDraft : settings
    })
  }, [settings])

  useEffect(() => { onUnsavedChange?.(hasChanges) }, [hasChanges, onUnsavedChange])

  useEffect(() => {
    if (!hasChanges) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  useEffect(() => {
    if (!statusMessage || statusMessage === 'Saving settings...') return
    const timeoutId = window.setTimeout(() => setStatusMessage(''), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [statusMessage])

  const checkOllama = async () => {
    const connected = await checkOllamaStatus(pendingSettings.ollamaUrl)
    if (connected) {
      const models = await listOllamaModels(pendingSettings.ollamaUrl)
      if (models.length > 0) {
        const formatted = models.map(m => ({ code: m.name, displayName: `${m.name} (${m.details.parameter_size})` }))
        const enriched = await enrichOllamaModelsWithContext(pendingSettings.ollamaUrl, formatted)
        handleChange({ ollamaModels: enriched })
      }
    }
  }

  useEffect(
    () => { if (pendingSettings.modelProvider === 'ollama') void checkOllama() },
    [pendingSettings.modelProvider, pendingSettings.ollamaUrl]
  )

  return (
    <div className="settings-container">
      <ScrollArea
        className="settings-main-col"
        viewportClassName="settings-main-col__viewport"
        viewportStyle={{ paddingBottom: hasChanges ? 110 : 24 }}
      >
        <div className="settings-shell">
          <div className="settings-shell__content">
            {normalizedActiveSection === 'usage' && (
              <UsageSection
                stats={usageStats}
                onExportSnapshot={handleExportUsageSnapshot}
                onExportWebSearchCsv={handleExportWebSearchCsv}
              />
            )}

            {normalizedActiveSection === 'providers' && (
              <ProviderHubSection
                initialProvider={settingsSectionParams?.provider}
                initialManageMode={settingsSectionParams?.manageMode}
                onParamsConsumed={clearParams}
                alibabaApiKey={pendingSettings.alibabaApiKey}
                deepseekApiKey={pendingSettings.deepseekApiKey}
                fireworksApiKey={pendingSettings.fireworksApiKey}
                nvidiaApiKey={pendingSettings.nvidiaApiKey}
                groqApiKey={pendingSettings.groqApiKey}
                openRouterApiKey={pendingSettings.openRouterApiKey}
                perplexityApiKey={pendingSettings.perplexityApiKey}
                tavilyApiKey={pendingSettings.tavilyApiKey}
                onlineCompilerApiKey={pendingSettings.onlineCompilerApiKey}
                tavilySearchDepthPreference={pendingSettings.tavilySearchDepthPreference}
                webSearchIncludeImages={pendingSettings.webSearchIncludeImages}
                ollamaUrl={pendingSettings.ollamaUrl}
                aiModel={pendingSettings.aiModel}
                modelProvider={pendingSettings.modelProvider}
                providerEnabled={pendingSettings.providerEnabled}
                configuredModels={pendingSettings.configuredModels}
                alibabaModels={pendingSettings.alibabaModels}
                deepseekModels={pendingSettings.deepseekModels}
                fireworksModels={pendingSettings.fireworksModels}
                nvidiaModels={pendingSettings.nvidiaModels}
                groqModels={pendingSettings.groqModels}
                ollamaModels={pendingSettings.ollamaModels}
                perplexityModels={pendingSettings.perplexityModels}
                maxTokens={pendingSettings.maxTokens}
                deepseekReasoning={pendingSettings.deepseekReasoning}
                deepseekLastEffort={pendingSettings.deepseekLastEffort}
                onChange={handleChange}
              />
            )}

            {!isMacOSRuntime() && normalizedActiveSection === 'overlay' && (
              <OverlaySection
                overlay={pendingSettings.overlay}
                onChange={(changes) => handleChange(changes)}
              />
            )}

            {normalizedActiveSection === 'mcp' && <McpSection />}

            {normalizedActiveSection === 'skills' && (
              <SkillsSection
                skills={pendingSettings.skills}
                codeExecutionAutoApprove={pendingSettings.codeExecutionAutoApprove}
                terminalAutoApprove={pendingSettings.terminalAutoApprove}
                computerUseAutoApprove={pendingSettings.computerUseAutoApprove}
                onChange={(changes) => handleChange(changes)}
              />
            )}

            {normalizedActiveSection === 'memory' && (
              <MemorySection
                skills={pendingSettings.skills}
                settings={pendingSettings}
                onChange={(changes) => handleChange(changes)}
              />
            )}

            {normalizedActiveSection === 'themes' && (
              <AppearanceSection
                settings={pendingSettings}
                onChange={(changes) => handleChange(changes)}
                initialCommandPaletteTab={settingsSectionParams?.commandPaletteTab}
                onParamsConsumed={clearParams}
              />
            )}

            {normalizedActiveSection === 'systemprompt' && (
              <SystemPromptSection
                systemPrompt={pendingSettings.systemPrompt}
                assistantPersonality={pendingSettings.assistantPersonality}
                webSearchPrompt={pendingSettings.webSearchPrompt}
                titleGenerationPrompt={pendingSettings.titleGenerationPrompt}
                codeExecutionPrompt={pendingSettings.codeExecutionPrompt}
                terminalPrompt={pendingSettings.terminalPrompt}
                computerUsePrompt={pendingSettings.computerUsePrompt}
                chartGenerationPrompt={pendingSettings.chartGenerationPrompt}
                memoryPrompt={pendingSettings.memoryPrompt}
                remindersPrompt={pendingSettings.remindersPrompt}
                onChange={(changes) => handleChange(changes)}
              />
            )}

            {normalizedActiveSection === 'resource-monitor' && <ResourceMonitorSection />}
            
          </div>
        </div>
      </ScrollArea>

      {hasChanges && (
        <div className={`settings-savebar ${showWarning ? 'settings-savebar--warning' : ''}`} role="region" aria-label="Unsaved settings changes">
          <div className="settings-savebar__text">
            {showWarning ? 'Save or discard your changes before leaving.' : 'You have unsaved changes.'}
          </div>

          <div className="settings-savebar__actions">
            <button
              onClick={cancelChanges}
              disabled={isSaving}
              className="settings-savebar__button settings-savebar__button--ghost"
            >
              Discard
            </button>
            <button
              onClick={saveChanges}
              disabled={isSaving}
              className="settings-savebar__button settings-savebar__button--primary"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="settings-announcer" role="status" aria-live="polite">
        {statusMessage}
      </div>
    </div>
  )
}
