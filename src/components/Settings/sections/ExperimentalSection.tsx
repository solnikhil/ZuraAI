import React from 'react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export interface ExperimentalSectionProps {
  streamResponses: boolean
  frostedSidebar: boolean
  frostedPrompt: boolean
  sidebarAutoHideOnResize: boolean
  onChange: (changes: { streamResponses?: boolean; frostedSidebar?: boolean; frostedPrompt?: boolean; sidebarAutoHideOnResize?: boolean }) => void
}

export function ExperimentalSection({ streamResponses, frostedSidebar, frostedPrompt, sidebarAutoHideOnResize, onChange }: ExperimentalSectionProps): React.ReactElement {
  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">Experimental</h2>
        <div className="page-subtitle">Early features and tuning controls</div>
      </div>

      <Card className="settings-section-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Smooth streaming</h3>
            <div className="section-desc">Update chat output at a higher cadence for a more fluid stream. May use more CPU.</div>
          </div>
          <Switch
            checked={streamResponses}
            onCheckedChange={(checked) => onChange({ streamResponses: checked })}
            aria-label="Enable smooth streaming"
          />
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Frosted Sidebar</h3>
            <div className="section-desc">Enable a glassmorphism effect on the sidebar with a frosted glass appearance.</div>
          </div>
          <Switch
            checked={frostedSidebar}
            onCheckedChange={(checked) => onChange({ frostedSidebar: checked })}
            aria-label="Enable frosted sidebar"
          />
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Frosted Prompt</h3>
            <div className="section-desc">Add a glassy, softly refracted surface to the chat prompt area.</div>
          </div>
          <Switch
            checked={frostedPrompt}
            onCheckedChange={(checked) => onChange({ frostedPrompt: checked })}
            aria-label="Enable frosted prompt"
          />
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Sidebar auto-hide on resize</h3>
            <div className="section-desc">Hide the sidebar when the window is at or below minimum width (900px). You can unhide it anytime with the eye icon in the title bar.</div>
          </div>
          <Switch
            checked={sidebarAutoHideOnResize}
            onCheckedChange={(checked) => onChange({ sidebarAutoHideOnResize: checked })}
            aria-label="Enable sidebar auto-hide on resize"
          />
        </div>
      </Card>
    </div>
  )
}

export default ExperimentalSection
