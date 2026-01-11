/**
 * ApiKeysSection component for Settings
 * Manages API keys and tool configurations
 * 
 * @module ApiKeysSection
 * Requirements: 2.4
 */

import React, { useState } from 'react'
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
  /** Whether tools are enabled */
  toolsEnabled: boolean
  /** Callback when settings change */
  onChange: (changes: Partial<{
    openRouterApiKey: string
    perplexityApiKey: string
    geminiApiKey: string
    groqApiKey: string
    tavilyApiKey: string
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
 * Available tools list
 */
const AVAILABLE_TOOLS = [
  { name: 'web_search', desc: 'Search the internet', icon: '🔍' },
  { name: 'fetch_url', desc: 'Read webpage content', icon: '🌐' },
  { name: 'calculator', desc: 'Evaluate math expressions', icon: '🧮' },
  { name: 'get_datetime', desc: 'Get current date/time', icon: '🕐' },
  { name: 'read_clipboard', desc: 'Read clipboard', icon: '📋' },
  { name: 'write_clipboard', desc: 'Copy to clipboard', icon: '📋' }
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

      {/* Tools Toggle */}
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Enable Tools</h3>
            <div className="section-desc">Allow AI to use tools like web search, calculator, etc.</div>
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
