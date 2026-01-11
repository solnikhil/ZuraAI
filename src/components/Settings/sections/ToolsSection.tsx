/**
 * ToolsSection component for Settings
 * Manages tool configurations
 * 
 * @module ToolsSection
 */

import React from 'react'
import { Sparkles, Globe, Calculator, Clock, Clipboard } from 'lucide-react'

/**
 * Props for ToolsSection component
 */
export interface ToolsSectionProps {
  /** Whether tools are enabled */
  toolsEnabled: boolean
  /** Tavily API key for web search */
  tavilyApiKey: string
  /** Callback when settings change */
  onChange: (changes: Partial<{
    toolsEnabled: boolean
    tavilyApiKey: string
  }>) => void
}

/**
 * Available built-in tools list
 */
const BUILT_IN_TOOLS = [
  { name: 'web_search', desc: 'Search the internet using Tavily', icon: Globe, color: '#60a5fa' },
  { name: 'fetch_url', desc: 'Read webpage content', icon: Globe, color: '#34d399' },
  { name: 'calculator', desc: 'Evaluate math expressions', icon: Calculator, color: '#f472b6' },
  { name: 'get_datetime', desc: 'Get current date/time', icon: Clock, color: '#fbbf24' },
  { name: 'read_clipboard', desc: 'Read clipboard content', icon: Clipboard, color: '#a78bfa' },
  { name: 'write_clipboard', desc: 'Copy to clipboard', icon: Clipboard, color: '#a78bfa' }
]

/**
 * ToolsSection - Manages tool settings
 */
export function ToolsSection({
  toolsEnabled,
  tavilyApiKey,
  onChange
}: ToolsSectionProps): React.ReactElement {

  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">Tools</h2>
        <div className="page-subtitle">Configure AI tools</div>
      </div>

      {/* Master Toggle */}
      <div className="settings-section-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: toolsEnabled ? 'linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-accent-hover) 100%)' : 'var(--theme-surface-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }}>
              <Sparkles size={24} color={toolsEnabled ? '#000' : 'var(--theme-text-muted)'} />
            </div>
            <div>
              <h3 className="section-head" style={{ marginBottom: 4 }}>Enable Tools</h3>
              <div className="section-desc">Allow AI to use tools like web search, calculator, etc.</div>
            </div>
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
      </div>

      {toolsEnabled && (
        <>
          {/* Web Search API Key */}
          <div className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 className="section-head">Web Search API</h3>
            <div className="section-desc" style={{ marginBottom: '12px' }}>
              Required for web search functionality. Get your key at{' '}
              <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--theme-accent)' }}>
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

          {/* Built-in Tools */}
          <div className="settings-section-card" style={{ marginTop: 24 }}>
            <h3 className="section-head">Built-in Tools</h3>
            <div className="section-desc" style={{ marginBottom: '16px' }}>
              These tools are always available when tools are enabled
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {BUILT_IN_TOOLS.map((tool) => {
                const IconComponent = tool.icon
                return (
                  <div
                    key={tool.name}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid var(--theme-border)',
                      background: 'var(--theme-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: `${tool.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <IconComponent size={20} color={tool.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>
                        {tool.name.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                        {tool.desc}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default ToolsSection
