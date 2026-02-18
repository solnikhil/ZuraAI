import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '../../contexts/SettingsContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useAppShell } from '../../contexts/AppShellContext'
import { checkOllamaStatus, listOllamaModels } from '../../services/ollama'
import { saveApiKeyToSecureStorage } from '../../utils/secureApiKeys'
import { UsageSection } from './sections/UsageSection'
import { ProviderHubSection } from './sections/ProviderHubSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { SystemPromptSection } from './sections/SystemPromptSection'
import { ExperimentalSection } from './sections/ExperimentalSection'

import { ActivityData } from './ActivityGraph'
import './Settings.css'

interface SettingsProps {
  activeSection?: string
  onUnsavedChange?: (hasChanges: boolean) => void
  showWarning?: boolean
}

export default function Settings({
  activeSection = 'usage', onUnsavedChange, showWarning = false
}: SettingsProps): React.ReactElement {
  const { settings, updateSettings } = useSettings()
  const { sessions } = useChatHistory()
  const { settingsSectionParams, setSettingsSectionParams } = useAppShell()
  const [pendingSettings, setPendingSettings] = useState(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const clearParams = useCallback(() => setSettingsSectionParams(null), [setSettingsSectionParams])

  const usageStats = useMemo(() => {
    const now = Date.now()
    const todayStart = new Date().setHours(0, 0, 0, 0)
    let totalMessages = 0, totalTokens = 0, todayMessages = 0
    const activeDaysSet = new Set<string>()

    sessions.forEach(session => {
      session.messages.forEach(msg => {
        totalMessages++
        if (msg.usage) totalTokens += msg.usage.totalTokens || 0
        if (msg.timestamp >= todayStart) todayMessages++
        activeDaysSet.add(new Date(msg.timestamp).toDateString())
      })
    })

    const activityData: ActivityData[] = []
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      activityData.push({
        label: `${months[d.getMonth()]} ${d.getDate()}`,
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        tokens: 0,
        modelBreakdown: {}
      })
    }

    sessions.forEach(session => {
      session.messages.forEach(msg => {
        const diffTime = now - msg.timestamp
        const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000))
        if (diffDays >= 0 && diffDays < 30 && msg.usage) {
          const tokenCount = msg.usage.totalTokens || (msg.usage.inputTokens || 0) + (msg.usage.outputTokens || 0)
          const dayData = activityData[29 - diffDays]
          dayData.tokens += tokenCount
          
          if (msg.model) {
            const modelName = msg.model.split('/').pop() || msg.model
            dayData.modelBreakdown = dayData.modelBreakdown || {}
            dayData.modelBreakdown[modelName] = (dayData.modelBreakdown[modelName] || 0) + tokenCount
          }
        }
      })
    })

    let maxModel = 'N/A', maxCount = 0, imagesProcessed = 0, assistantMsgCount = 0, totalAssistantChars = 0
    const modelCounts: Record<string, number> = {}

    sessions.forEach(session => {
      session.messages.forEach(msg => {
        if (msg.role === 'assistant') {
          assistantMsgCount++
          totalAssistantChars += msg.content.length
          if (msg.model) {
            const mName = msg.model.split('/').pop() || msg.model
            modelCounts[mName] = (modelCounts[mName] || 0) + 1
            if (modelCounts[mName] > maxCount) { maxCount = modelCounts[mName]; maxModel = mName }
          }
        }
        if (msg.image) imagesProcessed++
      })
    })

    return {
      totalSessions: sessions.length, totalMessages, totalTokens, todayMessages, activityData,
      storageUsed: Math.round((totalMessages * 500) / 1024),
      avgTokens: totalMessages > 0 ? Math.round(totalTokens / totalMessages) : 0,
      mostUsedModel: maxModel, imagesProcessed,
      avgResponseLength: assistantMsgCount > 0 ? Math.round(totalAssistantChars / assistantMsgCount) : 0,
      activeDays: activeDaysSet.size
    }
  }, [sessions])

  useEffect(() => {
    if (JSON.stringify(settings) !== JSON.stringify(pendingSettings)) setPendingSettings(settings)
  }, [settings])

  const handleChange = (changes: Partial<typeof settings>) => setPendingSettings(prev => ({ ...prev, ...changes }))

  const saveChanges = async () => {
    if (isSaving) return

    setIsSaving(true)
    setStatusMessage('Saving settings...')

    let allSaved = true
    const failedKeys: string[] = []
    try {
      type ApiKeyType = 'openRouterApiKey' | 'perplexityApiKey' | 'groqApiKey' | 'tavilyApiKey' | 'nvidiaApiKey' | 'alibabaApiKey'
      const keyMappings: Array<{ key: ApiKeyType; current: string; original: string }> = [
        { key: 'openRouterApiKey', current: pendingSettings.openRouterApiKey, original: settings.openRouterApiKey },
        { key: 'perplexityApiKey', current: pendingSettings.perplexityApiKey, original: settings.perplexityApiKey },
        { key: 'groqApiKey', current: pendingSettings.groqApiKey, original: settings.groqApiKey },
        { key: 'tavilyApiKey', current: pendingSettings.tavilyApiKey, original: settings.tavilyApiKey },
        { key: 'nvidiaApiKey', current: pendingSettings.nvidiaApiKey, original: settings.nvidiaApiKey },
        { key: 'alibabaApiKey', current: pendingSettings.alibabaApiKey, original: settings.alibabaApiKey },
      ]
      for (const { key, current, original } of keyMappings) {
        if (current !== original) {
          const success = await saveApiKeyToSecureStorage(key, current)
          if (!success) { failedKeys.push(key); allSaved = false }
        }
      }
      if (failedKeys.length > 0) console.warn('[Settings] Failed to save some API keys:', failedKeys.join(', '))
    } catch (error) {
      console.error('[Settings] Failed to save API keys to secure storage:', error)
      allSaved = false
    }

    updateSettings(pendingSettings)

    if (!allSaved && failedKeys.length > 0) {
      console.warn('[Settings] Some API keys may not have been saved')
      setStatusMessage('Saved with warnings. Some API keys could not be stored securely.')
    } else {
      setStatusMessage('Settings saved.')
    }

    setIsSaving(false)
  }

  const cancelChanges = () => {
    if (isSaving) return
    setPendingSettings(settings)
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
  const hasChanges = baseChanged || ollamaEnabledChanged

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
        handleChange({ ollamaModels: models.map(m => ({ code: m.name, displayName: `${m.name} (${m.details.parameter_size})` })) })
      }
    }
  }

  useEffect(() => {
    void checkOllama()
  }, [])

  useEffect(
    () => { if (pendingSettings.modelProvider === 'ollama') void checkOllama() },
    [pendingSettings.modelProvider, pendingSettings.ollamaUrl]
  )

  return (
    <div className="settings-container">
      <ScrollArea
        className="settings-main-col"
        style={{
          padding: '0',
          height: '100%',
          maxWidth: '100%',
          overflow: 'hidden'
        }}
        viewportStyle={{ paddingBottom: hasChanges ? 80 : 0 }}
      >
        <div style={{
          width: '100%',
          maxWidth: '100%',
          margin: '0 auto',
          padding: '0 24px',
          transition: 'max-width 0.3s ease'
        }}>
          {activeSection === 'usage' && (
            <UsageSection
              stats={usageStats}
              sessions={sessions}
            />
          )}

          {(activeSection === 'providers' || activeSection === 'models' || activeSection === 'preferences' || activeSection === 'tools') && (
            <ProviderHubSection
              initialProvider={settingsSectionParams?.provider}
              initialManageMode={settingsSectionParams?.manageMode}
              onParamsConsumed={clearParams}
              openRouterApiKey={pendingSettings.openRouterApiKey}
              perplexityApiKey={pendingSettings.perplexityApiKey}
              groqApiKey={pendingSettings.groqApiKey}
              nvidiaApiKey={pendingSettings.nvidiaApiKey}
              alibabaApiKey={pendingSettings.alibabaApiKey}
              tavilyApiKey={pendingSettings.tavilyApiKey ?? settings.tavilyApiKey}
              ollamaUrl={pendingSettings.ollamaUrl ?? settings.ollamaUrl}
              toolsEnabled={pendingSettings.toolsEnabled ?? settings.toolsEnabled}
              webSearchEnabled={pendingSettings.webSearchEnabled ?? settings.webSearchEnabled}
              structuredResearchEnabled={pendingSettings.structuredResearchEnabled ?? settings.structuredResearchEnabled}
              aiModel={pendingSettings.aiModel ?? settings.aiModel}
              modelProvider={pendingSettings.modelProvider ?? settings.modelProvider}
              configuredModels={pendingSettings.configuredModels || []}
              perplexityModels={pendingSettings.perplexityModels || []}
              groqModels={pendingSettings.groqModels || []}
              nvidiaModels={pendingSettings.nvidiaModels || []}
              alibabaModels={pendingSettings.alibabaModels || []}
              ollamaModels={pendingSettings.ollamaModels || []}
              maxTokens={pendingSettings.maxTokens ?? settings.maxTokens}
              titleModel={pendingSettings.titleModel || settings.titleModel || 'google/gemini-2.0-flash-exp:free'}
              onChange={handleChange}
            />
          )}

          {activeSection === 'themes' && (
            <AppearanceSection />
          )}

          {activeSection === 'systemprompt' && (
            <SystemPromptSection
              systemPrompt={pendingSettings.systemPrompt ?? settings.systemPrompt}
              webSearchPrompt={pendingSettings.webSearchPrompt ?? settings.webSearchPrompt}
              onChange={(changes) => handleChange(changes)}
            />
          )}

          {activeSection === 'experimental' && (
            <ExperimentalSection
              frostedSidebar={pendingSettings.frostedSidebar ?? settings.frostedSidebar}
              frostedPrompt={pendingSettings.frostedPrompt ?? settings.frostedPrompt}
              sidebarAutoHideOnResize={pendingSettings.sidebarAutoHideOnResize ?? settings.sidebarAutoHideOnResize}
              softenedContrast={pendingSettings.softenedContrast ?? settings.softenedContrast}
              onChange={(changes) => handleChange(changes)}
            />
          )}

        </div>
      </ScrollArea>

      {hasChanges && (
        <div style={{
          left: 20,
          right: 20,
          position: 'absolute',
          bottom: 16,
          padding: '12px 16px',
          background: showWarning ? 'rgba(239, 68, 68, 0.95)' : 'rgba(30, 34, 42, 0.98)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          borderRadius: 12,
          border: showWarning ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)',
          boxShadow: showWarning ? '0 8px 32px rgba(239, 68, 68, 0.3)' : '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 100,
          transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s'
        }} role="region" aria-label="Unsaved settings changes">
          <span style={{
            color: showWarning ? '#fff' : '#a0a0a0',
            fontSize: '0.9rem',
            fontWeight: showWarning ? 600 : 400,
            flex: 1
          }}>
            {showWarning ? 'Save or discard changes before leaving this section.' : 'You have unsaved settings changes.'}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={cancelChanges}
              disabled={isSaving}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.16)',
                color: showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280',
                fontSize: '0.9rem',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                opacity: isSaving ? 0.6 : 1,
                transition: 'color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280'}
            >
              Discard changes
            </button>
            <button
              onClick={saveChanges}
              disabled={isSaving}
              style={{
                background: showWarning ? '#fff' : '#22c55e',
                border: 'none',
                color: showWarning ? '#dc2626' : '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 6,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.8 : 1,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                if (isSaving) return
                e.currentTarget.style.background = showWarning ? '#f0f0f0' : '#16a34a'
              }}
              onMouseLeave={e => {
                if (isSaving) return
                e.currentTarget.style.background = showWarning ? '#fff' : '#22c55e'
              }}
            >
              {isSaving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          border: 0
        }}
      >
        {statusMessage}
      </div>
    </div>
  )
}
