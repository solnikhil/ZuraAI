/**
 * ApiKeyManager component for Settings
 * Handles secure API key input and storage
 * 
 * @module ApiKeyManager
 * Requirements: 2.3
 */

import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * API key configuration
 */
export interface ApiKeyConfig {
  /** Key identifier */
  id: string
  /** Display label */
  label: string
  /** Input placeholder */
  placeholder: string
  /** Current value */
  value: string
}

/**
 * Props for ApiKeyManager component
 */
export interface ApiKeyManagerProps {
  /** API key configurations */
  keys: ApiKeyConfig[]
  /** Callback when a key value changes */
  onChange: (keyId: string, value: string) => void
}

/**
 * Single API key input field with visibility toggle
 */
interface ApiKeyInputProps {
  config: ApiKeyConfig
  onChange: (value: string) => void
}

function ApiKeyInput({ config, onChange }: ApiKeyInputProps): React.ReactElement {
  const [showKey, setShowKey] = useState(false)

  return (
    <div>
      <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>
        {config.label}
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type={showKey ? 'text' : 'password'}
          className="setting-input-scira"
          value={config.value}
          onChange={e => onChange(e.target.value)}
          placeholder={config.placeholder}
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
 * ApiKeyManager - Manages multiple API key inputs
 * Provides secure input with visibility toggle for each key
 */
export function ApiKeyManager({ keys, onChange }: ApiKeyManagerProps): React.ReactElement {
  return (
    <div className="settings-section-card">
      <h3 className="section-head">Provider Credentials</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {keys.map(keyConfig => (
          <ApiKeyInput
            key={keyConfig.id}
            config={keyConfig}
            onChange={(value) => onChange(keyConfig.id, value)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Default API key configurations for common providers
 */
export const DEFAULT_API_KEY_CONFIGS: Omit<ApiKeyConfig, 'value'>[] = [
  {
    id: 'openRouterApiKey',
    label: 'OpenRouter API Key',
    placeholder: 'sk-or-...'
  },
  {
    id: 'perplexityApiKey',
    label: 'Perplexity API Key',
    placeholder: 'pplx-...'
  },
  {
    id: 'geminiApiKey',
    label: 'Gemini API Key',
    placeholder: 'AIza...'
  },
  {
    id: 'groqApiKey',
    label: 'Groq API Key',
    placeholder: 'gsk_...'
  }
]

/**
 * Create API key configs from settings object
 */
export function createApiKeyConfigs(settings: Record<string, string>): ApiKeyConfig[] {
  return DEFAULT_API_KEY_CONFIGS.map(config => ({
    ...config,
    value: settings[config.id] || ''
  }))
}

export default ApiKeyManager
