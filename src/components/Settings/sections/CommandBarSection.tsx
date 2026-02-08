import React from 'react'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Settings } from '../../../contexts/SettingsContext'

export interface CommandBarSectionProps {
  commandBar: Settings['commandBar']
  onChange: (changes: Partial<Settings['commandBar']>) => void
  rememberLastChatSession?: boolean
  rememberLastDashboardView?: boolean
  rememberLastSettingsSection?: boolean
  onRememberChange?: (changes: { rememberLastChatSession?: boolean; rememberLastDashboardView?: boolean; rememberLastSettingsSection?: boolean }) => void
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function CommandBarSection({ commandBar, onChange, rememberLastChatSession, rememberLastDashboardView, rememberLastSettingsSection, onRememberChange }: CommandBarSectionProps): React.ReactElement {
  const maxRecents = clampNumber(commandBar.maxRecents, 0, 3)
  const maxSuggestions = clampNumber(commandBar.maxSuggestions, 3, 12)
  const blurPx = clampNumber(commandBar.blurPx, 0, 30)
  const fieldSurface = clampNumber(commandBar.fieldSurface, 20, 90)
  const fieldSurfaceFocused = clampNumber(commandBar.fieldSurfaceFocused, 20, 90)
  const dropdownSurface = clampNumber(commandBar.dropdownSurface, 20, 90)

  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">Command Bar</h2>
        <div className="page-subtitle">Configure the titlebar command palette</div>
      </div>

      <Card className="settings-section-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Enable Command Bar</h3>
            <div className="section-desc">Show the command bar in the title bar</div>
          </div>
          <Switch
            checked={commandBar.enabled}
            onCheckedChange={(checked) => onChange({ enabled: checked })}
            aria-label="Enable command bar"
          />
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">Behavior</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Recent commands</div>
              <div className="section-desc">Show your last 1–3 commands at the top</div>
            </div>
            <Switch
              checked={commandBar.showRecents}
              onCheckedChange={(checked) => onChange({ showRecents: checked })}
              aria-label="Show recent commands"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Max recents</div>
              <div className="section-desc">How many recent commands to show</div>
            </div>
            <select
              value={maxRecents}
              onChange={(e) => onChange({ maxRecents: Number(e.target.value) })}
              className="setting-input-scira"
              style={{ width: 120 }}
              disabled={!commandBar.showRecents}
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Tab autocomplete</div>
              <div className="section-desc">Press Tab to complete commands</div>
            </div>
            <Switch
              checked={commandBar.enableTabAutocomplete}
              onCheckedChange={(checked) => onChange({ enableTabAutocomplete: checked })}
              aria-label="Enable tab autocomplete"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Max results</div>
              <div className="section-desc">Limit dropdown height and clutter</div>
            </div>
            <select
              value={maxSuggestions}
              onChange={(e) => onChange({ maxSuggestions: Number(e.target.value) })}
              className="setting-input-scira"
              style={{ width: 120 }}
            >
              {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">Appearance</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Size</div>
              <div className="section-desc">Controls command bar width</div>
            </div>
            <select
              value={commandBar.size}
              onChange={(e) => onChange({ size: e.target.value as Settings['commandBar']['size'] })}
              className="setting-input-scira"
              style={{ width: 160 }}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Background blur</div>
              <div className="section-desc">Glass effect for the dropdown</div>
            </div>
            <Switch
              checked={commandBar.enableBlur}
              onCheckedChange={(checked) => onChange({ enableBlur: checked })}
              aria-label="Enable background blur"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Blur strength</div>
              <div className="section-desc">Higher values look more frosted</div>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              value={blurPx}
              onChange={(e) => onChange({ blurPx: Number(e.target.value) })}
              disabled={!commandBar.enableBlur}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Field opacity</div>
              <div className="section-desc">Lower values = more transparent</div>
            </div>
            <input
              type="range"
              min={20}
              max={90}
              value={fieldSurface}
              onChange={(e) => onChange({ fieldSurface: Number(e.target.value) })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Field opacity (focused)</div>
              <div className="section-desc">Applied when the command bar is active</div>
            </div>
            <input
              type="range"
              min={20}
              max={90}
              value={fieldSurfaceFocused}
              onChange={(e) => onChange({ fieldSurfaceFocused: Number(e.target.value) })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Dropdown opacity</div>
              <div className="section-desc">Controls how transparent suggestions are</div>
            </div>
            <input
              type="range"
              min={20}
              max={90}
              value={dropdownSurface}
              onChange={(e) => onChange({ dropdownSurface: Number(e.target.value) })}
            />
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 18, color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
        Tip: Use Ctrl+K / Cmd+K to focus the command bar.
      </div>

      {/* Remember Section */}
      <Card className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">Remember</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--theme-text-primary)' }}>Restore your last state when reopening Zura</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                id="remember-chat-session"
                checked={rememberLastChatSession ?? true}
                onCheckedChange={(checked) => onRememberChange?.({ rememberLastChatSession: checked === true })}
              />
              <Label
                htmlFor="remember-chat-session"
                style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)', cursor: 'pointer', userSelect: 'none' }}
              >
                Chat session
              </Label>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                id="remember-dashboard-view"
                checked={rememberLastDashboardView ?? true}
                onCheckedChange={(checked) => onRememberChange?.({ rememberLastDashboardView: checked === true })}
              />
              <Label
                htmlFor="remember-dashboard-view"
                style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)', cursor: 'pointer', userSelect: 'none' }}
              >
                Chat/Settings view
              </Label>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                id="remember-settings-section"
                checked={rememberLastSettingsSection ?? true}
                onCheckedChange={(checked) => onRememberChange?.({ rememberLastSettingsSection: checked === true })}
              />
              <Label
                htmlFor="remember-settings-section"
                style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)', cursor: 'pointer', userSelect: 'none' }}
              >
                Settings section
              </Label>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default CommandBarSection
