/**
 * Settings container component - Orchestrates settings sections and manages state
 * @module Settings
 * Requirements: 2.5, 2.6
 */
import React, { useState, useEffect, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '../../contexts/SettingsContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
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

/** Settings - Main container component that manages settings state and renders appropriate section */
export default function Settings({
  activeSection = 'usage', onUnsavedChange, showWarning = false
}: SettingsProps): React.ReactElement {
  const { settings, updateSettings } = useSettings()
  const { sessions } = useChatHistory()
  const [pendingSettings, setPendingSettings] = useState(settings)

  useEffect(() => {
  }, [activeSection])

  // Calculate usage statistics
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

    // Activity data calculation - 30 days of token usage
    const activityData: ActivityData[] = []
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    // Initialize 30 days with zero tokens
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      activityData.push({
        label: `${months[d.getMonth()]} ${d.getDate()}`,
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        tokens: 0,
        modelBreakdown: {}
      })
    }

    // Accumulate tokens per day and per model
    sessions.forEach(session => {
      session.messages.forEach(msg => {
        const diffTime = now - msg.timestamp
        const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000))
        if (diffDays >= 0 && diffDays < 30 && msg.usage) {
          const tokenCount = msg.usage.totalTokens || (msg.usage.inputTokens || 0) + (msg.usage.outputTokens || 0)
          const dayData = activityData[29 - diffDays]
          dayData.tokens += tokenCount
          
          // Track per-model usage
          if (msg.model) {
            const modelName = msg.model.split('/').pop() || msg.model
            dayData.modelBreakdown = dayData.modelBreakdown || {}
            dayData.modelBreakdown[modelName] = (dayData.modelBreakdown[modelName] || 0) + tokenCount
          }
        }
      })
    })

    // Most used model calculation
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

  // Sync settings when they change externally
  useEffect(() => {
    if (JSON.stringify(settings) !== JSON.stringify(pendingSettings)) setPendingSettings(settings)
  }, [settings])

  const handleChange = (changes: Partial<typeof settings>) => setPendingSettings(prev => ({ ...prev, ...changes }))

  // Save changes to secure storage
  const saveChanges = async () => {
    let allSaved = true
    const failedKeys: string[] = []
    try {
      type ApiKeyType = 'openRouterApiKey' | 'perplexityApiKey' | 'geminiApiKey' | 'groqApiKey' | 'tavilyApiKey' | 'minimaxApiKey'
      const keyMappings: Array<{ key: ApiKeyType; current: string; original: string }> = [
        { key: 'openRouterApiKey', current: pendingSettings.openRouterApiKey, original: settings.openRouterApiKey },
        { key: 'perplexityApiKey', current: pendingSettings.perplexityApiKey, original: settings.perplexityApiKey },
        { key: 'geminiApiKey', current: pendingSettings.geminiApiKey, original: settings.geminiApiKey },
        { key: 'groqApiKey', current: pendingSettings.groqApiKey, original: settings.groqApiKey },
        { key: 'tavilyApiKey', current: pendingSettings.tavilyApiKey, original: settings.tavilyApiKey },
        { key: 'minimaxApiKey', current: pendingSettings.minimaxApiKey, original: settings.minimaxApiKey }
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
    if (!allSaved && failedKeys.length > 0) console.warn('[Settings] Some API keys may not have been saved')
  }

  const cancelChanges = () => setPendingSettings(settings)

  // ollamaModels list is auto-discovered from the user's Ollama server (terminal). Only
  // user-controlled enabled flags matter for "unsaved changes"; list add/remove from server
  // state should not prompt "Save changes". Compare only models present in both lists.
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

  // Check Ollama connection
  const checkOllama = async () => {
    const connected = await checkOllamaStatus(pendingSettings.ollamaUrl)
    if (connected) {
      const models = await listOllamaModels(pendingSettings.ollamaUrl)
      if (models.length > 0) {
        handleChange({ ollamaModels: models.map(m => ({ code: m.name, displayName: `${m.name} (${m.details.parameter_size})` })) })
      }
    }
  }

  // Check Ollama connection on mount (regardless of model provider)
  useEffect(() => {
    void checkOllama()
  }, []) // Run once on mount

  // Also check Ollama when provider changes to ollama or URL changes
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
          {/* Usage Section */}
          {activeSection === 'usage' && (
            <UsageSection
              stats={usageStats}
              sessions={sessions}
            />
          )}

          {/* Providers Section (all-in-one models + API keys + search APIs) */}
          {(activeSection === 'providers' || activeSection === 'models' || activeSection === 'preferences' || activeSection === 'tools') && (
            <ProviderHubSection
              openRouterApiKey={pendingSettings.openRouterApiKey}
              perplexityApiKey={pendingSettings.perplexityApiKey}
              geminiApiKey={pendingSettings.geminiApiKey}
              groqApiKey={pendingSettings.groqApiKey}
              minimaxApiKey={pendingSettings.minimaxApiKey}
              tavilyApiKey={pendingSettings.tavilyApiKey ?? settings.tavilyApiKey}
              ollamaUrl={pendingSettings.ollamaUrl ?? settings.ollamaUrl}
              toolsEnabled={pendingSettings.toolsEnabled ?? settings.toolsEnabled}
              webSearchEnabled={pendingSettings.webSearchEnabled ?? settings.webSearchEnabled}
              deepResearchEnabled={pendingSettings.deepResearchEnabled ?? settings.deepResearchEnabled}
              aiModel={pendingSettings.aiModel ?? settings.aiModel}
              modelProvider={pendingSettings.modelProvider ?? settings.modelProvider}
              configuredModels={pendingSettings.configuredModels || []}
              perplexityModels={pendingSettings.perplexityModels || []}
              geminiModels={pendingSettings.geminiModels || []}
              groqModels={pendingSettings.groqModels || []}
              minimaxModels={pendingSettings.minimaxModels || []}
              ollamaModels={pendingSettings.ollamaModels || []}
              maxTokens={pendingSettings.maxTokens ?? settings.maxTokens}
              titleModel={pendingSettings.titleModel || settings.titleModel || 'gemini-2.5-flash'}
              onChange={handleChange}
            />
          )}

          {/* Appearance Section */}
          {activeSection === 'themes' && (
            <AppearanceSection />
          )}

          {/* System Prompt Section */}
          {activeSection === 'systemprompt' && (
            <SystemPromptSection
              systemPrompt={pendingSettings.systemPrompt ?? settings.systemPrompt}
              onChange={(changes) => handleChange(changes)}
            />
          )}

          {/* Experimental Section */}
          {activeSection === 'experimental' && (
            <ExperimentalSection
              streamResponses={pendingSettings.streamResponses ?? settings.streamResponses}
              frostedSidebar={pendingSettings.frostedSidebar ?? settings.frostedSidebar}
              frostedPrompt={pendingSettings.frostedPrompt ?? settings.frostedPrompt}
              sidebarAutoHideOnResize={pendingSettings.sidebarAutoHideOnResize ?? settings.sidebarAutoHideOnResize}
              onChange={(changes) => handleChange(changes)}
            />
          )}

        </div>
      </ScrollArea>

      {/* Unsaved Changes Bar */}
      {hasChanges && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 24px',
          background: showWarning ? 'rgba(239, 68, 68, 0.95)' : 'rgba(30, 34, 42, 0.98)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          borderRadius: 12,
          border: showWarning ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)',
          boxShadow: showWarning ? '0 8px 32px rgba(239, 68, 68, 0.3)' : '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 100,
          animation: showWarning ? 'shake 0.5s ease' : 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s'
        }}>
          <span style={{
            color: showWarning ? '#fff' : '#a0a0a0',
            fontSize: '0.9rem',
            fontWeight: showWarning ? 600 : 400
          }}>
            {showWarning ? 'Save or discard changes first!' : 'Careful — you have unsaved changes!'}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={cancelChanges}
              style={{
                background: 'transparent',
                border: 'none',
                color: showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280',
                fontSize: '0.9rem',
                cursor: 'pointer',
                padding: '6px 12px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280'}
            >
              Discard
            </button>
            <button
              onClick={saveChanges}
              style={{
                background: showWarning ? '#fff' : '#22c55e',
                border: 'none',
                color: showWarning ? '#dc2626' : '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = showWarning ? '#f0f0f0' : '#16a34a'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = showWarning ? '#fff' : '#22c55e'
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(-50%) translateX(0); }
          20%, 60% { transform: translateX(-50%) translateX(-8px); }
          40%, 80% { transform: translateX(-50%) translateX(8px); }
        }
      `}</style>
    </div>
  )
}
