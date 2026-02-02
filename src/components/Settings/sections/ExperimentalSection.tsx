import React from 'react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export interface ExperimentalSectionProps {
  streamResponses: boolean
  onChange: (changes: { streamResponses: boolean }) => void
}

export function ExperimentalSection({ streamResponses, onChange }: ExperimentalSectionProps): React.ReactElement {
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
    </div>
  )
}

export default ExperimentalSection
