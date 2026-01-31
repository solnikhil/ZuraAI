/**
 * ApiKeysSection component for Settings
 * Manages API keys and tool configurations
 *
 * @module ApiKeysSection
 * Requirements: 2.4
 */

import React, { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

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
  /** MiniMax API key */
  minimaxApiKey: string
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
    minimaxApiKey: string
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
  description?: string
  showToggle?: boolean
  onChange: (value: string) => void
}

function ApiKeyInput({
  label,
  value,
  placeholder,
  description,
  showToggle = true,
  onChange
}: ApiKeyInputProps): React.ReactElement {
  const [showKey, setShowKey] = useState(false)
  const inputId = React.useId()
  const inputType = showToggle ? (showKey ? 'text' : 'password') : 'password'

  return (
    <Field>
      <FieldLabel htmlFor={inputId} className="text-sm text-muted-foreground">{label}</FieldLabel>
      {showToggle ? (
        <div className="flex gap-2">
          <Input
            id={inputId}
            type={inputType}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-secondary border-border"
            autoComplete="new-password"
            spellCheck={false}
          />
          <Button
            variant="outline"
            size="icon"
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="shrink-0"
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </div>
      ) : (
        <Input
          id={inputId}
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-secondary border-border"
          autoComplete="new-password"
          spellCheck={false}
        />
      )}
      {description && (
        <FieldDescription className="text-xs text-muted-foreground">{description}</FieldDescription>
      )}
    </Field>
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
    <Card className="settings-section-card mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-head mb-0">Ollama (Local)</h3>
        {status === 'connected' && (
          <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">
            Connected • {modelCount} models
          </Badge>
        )}
        {status === 'checking' && (
          <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30">
            Checking...
          </Badge>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30">
              {errorMessage}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleAutoRunOllama}>
              Auto-Run Ollama
            </Button>
          </div>
        )}
      </div>
      <div className="section-desc mb-3">
        Connect to your local Ollama instance. Make sure Ollama is running.
      </div>
      <div className="flex gap-2">
        <Input
          type="text"
          value={ollamaUrl}
          onChange={e => onChange({ ollamaUrl: e.target.value })}
          placeholder="http://localhost:11434"
          className="flex-1 bg-secondary border-border"
        />
        <Button
          onClick={checkConnection}
          disabled={status === 'checking'}
        >
          {status === 'checking' ? 'Checking...' : 'Check'}
        </Button>
      </div>
    </Card>
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
  minimaxApiKey,
  tavilyApiKey,
  ollamaUrl,
  toolsEnabled,
  onChange
}: ApiKeysSectionProps): React.ReactElement {
  const secureKeyDescription = 'Your API key is encrypted and stored securely.'
  const tavilyInputId = React.useId()

  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">API Keys</h2>
        <div className="page-subtitle">Configure your API credentials for each provider</div>
      </div>

      {/* API Keys Section */}
      <Card className="settings-section-card">
        <h3 className="section-head">Provider Credentials</h3>
        <FieldGroup className="gap-5">
          <ApiKeyInput
            label="OpenRouter API Key"
            value={openRouterApiKey}
            placeholder="sk-or-..."
            description={secureKeyDescription}
            onChange={value => onChange({ openRouterApiKey: value })}
          />
          <ApiKeyInput
            label="Perplexity API Key"
            value={perplexityApiKey}
            placeholder="pplx-..."
            description={secureKeyDescription}
            onChange={value => onChange({ perplexityApiKey: value })}
          />
          <ApiKeyInput
            label="Gemini API Key"
            value={geminiApiKey}
            placeholder="AIza..."
            description={secureKeyDescription}
            onChange={value => onChange({ geminiApiKey: value })}
          />
          <ApiKeyInput
            label="Groq API Key"
            value={groqApiKey}
            placeholder="gsk_..."
            description={secureKeyDescription}
            onChange={value => onChange({ groqApiKey: value })}
          />
          <ApiKeyInput
            label="MiniMax API Key"
            value={minimaxApiKey}
            placeholder="mm-..."
            description={secureKeyDescription}
            onChange={value => onChange({ minimaxApiKey: value })}
          />
        </FieldGroup>
      </Card>

      {/* Ollama Section */}
      <OllamaSection ollamaUrl={ollamaUrl} onChange={onChange} />

      {/* Tools Toggle */}
      <Card className="settings-section-card mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="section-head mb-1">Enable Tools</h3>
            <div className="section-desc">Allow AI to use web search.</div>
          </div>
          <Switch
            checked={toolsEnabled}
            onCheckedChange={(checked) => onChange({ toolsEnabled: checked })}
            aria-label="Enable tools"
          />
        </div>

        {toolsEnabled && (
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="section-head mb-4">Web Search API</h3>
            <div className="section-desc mb-3">
              Get your Tavily key at{' '}
              <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                tavily.com
              </a>
            </div>
            <Field>
              <FieldLabel htmlFor={tavilyInputId} className="text-sm text-muted-foreground">
                Tavily API Key
              </FieldLabel>
              <Input
                id={tavilyInputId}
                type="password"
                placeholder="tvly-..."
                value={tavilyApiKey}
                onChange={(e) => onChange({ tavilyApiKey: e.target.value })}
                className="w-full bg-secondary border-border"
                autoComplete="new-password"
                spellCheck={false}
              />
              <FieldDescription className="text-xs text-muted-foreground">
                {secureKeyDescription}
              </FieldDescription>
            </Field>
          </div>
        )}
      </Card>

      {/* Available Tools List */}
      {toolsEnabled && (
        <Card className="settings-section-card" style={{ marginTop: 24 }}>
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
        </Card>
      )}
    </div>
  )
}

export default ApiKeysSection
