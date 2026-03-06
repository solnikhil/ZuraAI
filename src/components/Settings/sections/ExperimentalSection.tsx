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
      label: 'Frosted Sidebar',
      description: 'Enable a glassmorphism effect on the sidebar with a frosted glass appearance.',
      checked: frostedSidebar,
      onToggle: (checked: boolean) => onChange({ frostedSidebar: checked }),
      ariaLabel: 'Enable frosted sidebar',
    },
    {
      key: 'frostedPrompt' as const,
      label: 'Frosted Prompt',
      description: 'Add a glassy, softly refracted surface to the chat prompt area.',
      checked: frostedPrompt,
      onToggle: (checked: boolean) => onChange({ frostedPrompt: checked }),
      ariaLabel: 'Enable frosted prompt',
    },
    {
      key: 'softenedContrast' as const,
      label: 'Softened contrast',
      description: 'Reduce the harshness of text and surfaces for a gentler, easier-on-the-eyes look.',
      checked: softenedContrast,
      onToggle: (checked: boolean) => onChange({ softenedContrast: checked }),
      ariaLabel: 'Enable softened contrast',
    },
    {
      key: 'sidebarAutoHideOnResize' as const,
      label: 'Sidebar auto-hide on resize',
      description: 'Hide the sidebar when the window is at or below minimum width (900px). You can unhide it anytime with the eye icon in the title bar.',
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
          Experimental settings can change behavior between releases. If an interaction feels unstable,
          disable the related toggle and restart the app.
        </div>
      </Card>
    </div>
  )
}

export default ExperimentalSection
