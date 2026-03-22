import React from 'react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export interface ExperimentalSectionProps {
  frostedSidebar: boolean
  frostedPrompt: boolean
  sidebarAutoHideOnResize: boolean
  softenedContrast: boolean
  onChange: (changes: {
    frostedSidebar?: boolean
    frostedPrompt?: boolean
    sidebarAutoHideOnResize?: boolean
    softenedContrast?: boolean
  }) => void
}

export function ExperimentalSection({
  frostedSidebar,
  frostedPrompt,
  sidebarAutoHideOnResize,
  softenedContrast,
  onChange,
}: ExperimentalSectionProps): React.ReactElement {
  const toggles = [
    {
      key: 'frostedSidebar' as const,
      label: 'Frosted sidebar',
      description: 'Show a semi-transparent glass effect on the sidebar.',
      checked: frostedSidebar,
      onToggle: (checked: boolean) => onChange({ frostedSidebar: checked }),
      ariaLabel: 'Enable frosted sidebar',
    },
    {
      key: 'frostedPrompt' as const,
      label: 'Frosted prompt area',
      description: 'Add a glass-like backdrop to the chat input area.',
      checked: frostedPrompt,
      onToggle: (checked: boolean) => onChange({ frostedPrompt: checked }),
      ariaLabel: 'Enable frosted prompt',
    },
    {
      key: 'softenedContrast' as const,
      label: 'Softer contrast',
      description: 'Reduce text intensity for a gentler look. Helpful for extended reading sessions.',
      checked: softenedContrast,
      onToggle: (checked: boolean) => onChange({ softenedContrast: checked }),
      ariaLabel: 'Enable softened contrast',
    },
    {
      key: 'sidebarAutoHideOnResize' as const,
      label: 'Auto-hide sidebar on narrow windows',
      description: 'Hide the sidebar when the window is narrow. Click the eye icon in the title bar to show it again.',
      checked: sidebarAutoHideOnResize,
      onToggle: (checked: boolean) => onChange({ sidebarAutoHideOnResize: checked }),
      ariaLabel: 'Enable sidebar auto-hide on resize',
    },
  ]

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Experimental</h2>
        <div className="page-subtitle">Early features and tuning controls</div>
      </div>

      <Card className="settings-list-card">
        {toggles.map((toggle) => (
          <div key={toggle.key} className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">{toggle.label}</h3>
              <div className="settings-list-row__description">{toggle.description}</div>
            </div>
            <div className="settings-list-row__control">
              <Switch
                checked={toggle.checked}
                onCheckedChange={toggle.onToggle}
                aria-label={toggle.ariaLabel}
              />
            </div>
          </div>
        ))}
      </Card>
      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <div className="section-desc">
          These features are experimental and may change or be removed. If something doesn't work as expected, try disabling it here and restarting the app.
        </div>
      </Card>
    </div>
  )
}

export default ExperimentalSection
