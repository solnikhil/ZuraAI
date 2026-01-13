/**
 * ApiKeysSection component for Settings
 * Manages API keys and tool configurations
 * 
 * @module ApiKeysSection
 * Requirements: 2.4
 */

import React, { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * Props for ApiKeysSection component
 */
export interface ApiKeysSectionProps {
  /** OpenRouter API key */
  openRouterApiKey: string
  /** Perplexity API key */
  perplexityApiKey: string
  /** Gemini API key */
  geminiApiKey: string
  /** Groq API key */
  groqApiKey: string
  /** Tavily API key for web search */
  tavilyApiKey: string
  /** Ollama server URL */
  ollamaUrl: string
  /** Whether tools are enabled */
  toolsEnabled: boolean
  /** Callback when settings change */
  onChange: (changes: Partial<{
    openRouterApiKey: string
    perplexityApiKey: string
    geminiApiKey: string
    groqApiKey: string
    tavilyApiKey: string
    ollamaUrl: string
    toolsEnabled: boolean
  }>) => void
}

/**
 * API key input with visibility toggle
 */
interface ApiKeyInputProps {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

function ApiKeyInput({ label, value, placeholder, onChange }: ApiKeyInputProps): React.ReactElement {
  const [showKey, setShowKey] = useState(false)

  return (
    <div>
      <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type={showKey ? 'text' : 'password'}
          className="setting-input-scira"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          onClick={() => setShowKey(!showKey)}
          style={{
            padding: '0 14px',
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text-muted)',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--theme-border-hover)'
            e.currentTarget.style.color = 'var(--theme-text-secondary)'
            e.currentTarget.style.background = 'var(--theme-surface-hover)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--theme-border)'
            e.currentTarget.style.color = 'var(--theme-text-muted)'
            e.currentTarget.style.background = 'var(--theme-surface)'
          }}
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

/**
 * Ollama connection section with check button
 */
interface OllamaSectionProps {
  ollamaUrl: string
  onChange: (changes: { ollamaUrl?: string }) => void
}

function OllamaSection({ ollamaUrl, onChange }: OllamaSectionProps): React.ReactElement {
  const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle')
  const [modelCount, setModelCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const checkConnection = async () => {
    if (!ollamaUrl || ollamaUrl.trim() === '') {
      setStatus('error')
      setErrorMessage('Please enter Ollama URL')
      return
    }

    setStatus('checking')
    setErrorMessage('')

    try {
      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${ollamaUrl}/api/tags`, { 
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        const models = data.models || []
        setModelCount(models.length)
        setStatus('connected')
      } else {
        setStatus('error')
        setErrorMessage('Could not connect to Ollama')
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus('error')
        setErrorMessage('Connection timed out (5s)')
      } else {
        setStatus('error')
        setErrorMessage('Connection failed. Is Ollama running?')
      }
    }
  }

  // Auto-run Ollama handler - spawns terminal with Ollama
  const handleAutoRunOllama = () => {
    const terminal = (window as any).terminal
    if (terminal?.spawnCommand) {
      console.log('[Settings] Spawning Ollama in new terminal...')
      terminal.spawnCommand('ollama', ['serve'])
    } else {
      console.error('[Settings] Terminal API not available. Restart the app.')
    }
  }

  // Check connection on mount and when URL changes
  useEffect(() => {
    if (ollamaUrl && ollamaUrl.trim() !== '') {
      void checkConnection()
    }
  }, [ollamaUrl])

  return (
    <div className="settings-section-card" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="section-head" style={{ marginBottom: 0 }}>Ollama (Local)</h3>
        {status === 'connected' && (
          <span style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#22c55e',
            borderRadius: 12,
            fontWeight: 500
          }}>
            ●  Connected • {modelCount} models
          </span>
        )}
        {status === 'checking' && (
          <span style={{
            fontSize: '0.75rem',
            padding: '4px 10px',
            background: 'rgba(59, 130, 246, 0.15)',
            color: '#60a5fa',
            borderRadius: 12,
            fontWeight: 500
          }}>
            ●  Checking...
          </span>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: '0.75rem',
              padding: '4px 10px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              borderRadius: 12,
              fontWeight: 500
            }}>
              ●  {errorMessage}
            </span>
            <button
              onClick={handleAutoRunOllama}
              style={{
                fontSize: '0.7rem',
                padding: '4px 10px',
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text-secondary)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--theme-surface-hover)'
                e.currentTarget.style.borderColor = 'var(--theme-border-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--theme-surface)'
                e.currentTarget.style.borderColor = 'var(--theme-border)'
              }}
            >
              Auto-Run Ollama
            </button>
          </div>
        )}
      </div>
      <div className="section-desc" style={{ marginBottom: 12 }}>
        Connect to your local Ollama instance. Make sure Ollama is running.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          className="setting-input-scira"
          value={ollamaUrl}
          onChange={e => onChange({ ollamaUrl: e.target.value })}
          placeholder="http://localhost:11434"
          style={{ flex: 1 }}
        />
        <button
          onClick={checkConnection}
          disabled={status === 'checking'}
          style={{
            padding: '0 16px',
            background: status === 'checking' ? 'var(--theme-surface)' : 'var(--theme-accent)',
            border: 'none',
            color: '#fff',
            borderRadius: '10px',
            cursor: status === 'checking' ? 'default' : 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            opacity: status === 'checking' ? 0.7 : 1
          }}
        >
          {status === 'checking' ? 'Checking...' : 'Check'}
        </button>
      </div>
    </div>
  )
}

/**
 * Available tools list
 */
const AVAILABLE_TOOLS = [
  { name: 'web_search', desc: 'Search the internet', icon: '🔍' },
]


/**
 * ApiKeysSection - Manages API keys and tool settings
 */
export function ApiKeysSection({
  openRouterApiKey,
  perplexityApiKey,
  geminiApiKey,
  groqApiKey,
  tavilyApiKey,
  ollamaUrl,
  toolsEnabled,
  onChange
}: ApiKeysSectionProps): React.ReactElement {
  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">API Keys</h2>
        <div className="page-subtitle">Configure your API credentials for each provider</div>
      </div>

      {/* API Keys Section */}
      <div className="settings-section-card">
        <h3 className="section-head">Provider Credentials</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ApiKeyInput
            label="OpenRouter API Key"
            value={openRouterApiKey}
            placeholder="sk-or-..."
            onChange={value => onChange({ openRouterApiKey: value })}
          />
          <ApiKeyInput
            label="Perplexity API Key"
            value={perplexityApiKey}
            placeholder="pplx-..."
            onChange={value => onChange({ perplexityApiKey: value })}
          />
          <ApiKeyInput
            label="Gemini API Key"
            value={geminiApiKey}
            placeholder="AIza..."
            onChange={value => onChange({ geminiApiKey: value })}
          />
          <ApiKeyInput
            label="Groq API Key"
            value={groqApiKey}
            placeholder="gsk_..."
            onChange={value => onChange({ groqApiKey: value })}
          />
        </div>
      </div>

      {/* Ollama Section */}
      <OllamaSection ollamaUrl={ollamaUrl} onChange={onChange} />

      {/* Tools Toggle */}
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Enable Tools</h3>
            <div className="section-desc">Allow AI to use web search.</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={toolsEnabled}
              onChange={(e) => onChange({ toolsEnabled: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {toolsEnabled && (
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--theme-border)' }}>
            <h3 className="section-head" style={{ marginBottom: '16px' }}>Web Search API</h3>
            <div className="section-desc" style={{ marginBottom: '12px' }}>
              Get your Tavily key at{' '}
              <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>
                tavily.com
              </a>
            </div>
            <input
              type="password"
              className="setting-input-scira"
              placeholder="tvly-..."
              value={tavilyApiKey}
              onChange={(e) => onChange({ tavilyApiKey: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </div>

      {/* Available Tools List */}
      {toolsEnabled && (
        <div className="settings-section-card" style={{ marginTop: 24 }}>
          <h3 className="section-head">Available Tools</h3>
          <div className="section-desc" style={{ marginBottom: '16px' }}>
            All tools enabled
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
            {AVAILABLE_TOOLS.map((tool) => (
              <div
                key={tool.name}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>{tool.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#e0e0e0' }}>
                    {tool.name.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>{tool.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ApiKeysSection
