import React from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

import { isSkillEnabled, type SkillsSettings } from '@/skills'
import { Monitor } from '../../icons'
import type { Settings } from '@/contexts/SettingsContext'
import { buildAgentModeSettingsUpdate, prepareAgentModeExit } from '@/agent/agentModeTransition'

export interface ComputerUseSectionProps {
  skills: SkillsSettings
  onChange: (changes: {
    skills?: SkillsSettings
    assistantMode?: Settings['assistantMode']
  }) => void
}

export function ComputerUseSection({
  skills,
  onChange,
}: ComputerUseSectionProps): React.ReactElement {
  const thisDesktopEnabled = isSkillEnabled(skills, 'computer_use')

  const handleThisDesktopChange = async (enabled: boolean) => {
    if (!enabled) {
      try {
        await prepareAgentModeExit()
      } catch {
        return
      }
    }
    onChange(buildAgentModeSettingsUpdate(skills, enabled))
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Agent Mode</h2>
        <div className="page-subtitle">
          Let Agent mode use screenshots, clicks, typing, scrolling, and app controls on the desktop
          you are currently using.
        </div>
      </div>

      <Card className="settings-section-card provider-hub-base-card mt-4">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2">
              <Monitor size={18} />
              <span className="text-xl font-semibold leading-none text-foreground sm:text-2xl lg:text-[28px]">
                Agent Mode
              </span>
            </div>
          </div>

          <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">
            Computer Use controls the current Windows desktop only. Actions still use the existing
            approval dialog and Esc+Esc kill switch. Background-safe sessions reserve only their
            target window and show a guard while Zura is using it.
          </p>

          <DetailField
            label="Enable Agent Mode"
            description="Let Agent Mode control the desktop you are currently using."
            control={
              <Switch
                className="provider-hub-toggle"
                checked={thisDesktopEnabled}
                onCheckedChange={(enabled) => void handleThisDesktopChange(enabled)}
                aria-label="Enable Agent Mode"
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
