import React from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

import {
  isSkillEnabled,
  withComputerUseEnabled,
  type SkillsSettings,
} from '@/skills'
import { Monitor } from '../../icons'

export interface ComputerUseSectionProps {
  skills: SkillsSettings
  onChange: (changes: { skills?: SkillsSettings }) => void
}

export function ComputerUseSection({
  skills,
  onChange,
}: ComputerUseSectionProps): React.ReactElement {
  const thisDesktopEnabled = isSkillEnabled(skills, 'computer_use')

  const handleThisDesktopChange = (enabled: boolean) => {
    onChange({
      skills: withComputerUseEnabled(skills, enabled),
    })
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Computer Use</h2>
        <div className="page-subtitle">
          Let Agent mode use screenshots, clicks, typing, scrolling, and app controls on the
          desktop you are currently using.
        </div>
      </div>

      <Card
        className="settings-section-card provider-hub-base-card mt-4"
        style={{ background: '#212121' }}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2">
              <Monitor size={18} />
              <span className="text-xl font-semibold leading-none text-foreground sm:text-2xl lg:text-[28px]">
                Desktop control
              </span>
            </div>
          </div>

          <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">
            Computer Use controls the current Windows desktop only. Actions still use the
            existing approval dialog, auto-approval setting, and Esc+Esc kill switch.
          </p>

          <DetailField
            label="Control this desktop"
            description="Use Computer Use on the desktop you are currently using while Agent mode is active."
            control={
              <Switch
                className="provider-hub-toggle"
                checked={thisDesktopEnabled}
                onCheckedChange={handleThisDesktopChange}
                aria-label="Enable control this desktop"
              />
            }
          />
        </div>
      </Card>
    </div>
  )
}

function DetailField({
  label,
  description,
  control,
}: {
  label: string
  description: string
  control: React.ReactNode
}): React.ReactElement {
  return (
    <div className="settings-list-row items-center">
      <div className="min-w-0">
        <div className="settings-list-row__label">{label}</div>
        <div className="settings-list-row__description">{description}</div>
      </div>
      <div className="settings-list-row__control">{control}</div>
    </div>
  )
}

export default ComputerUseSection
