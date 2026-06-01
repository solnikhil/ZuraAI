import React, { useState } from 'react'

import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  isAgentDesktopEnabled,
  isSkillEnabled,
  withComputerUseEnabled,
  withAgentDesktopEnabled,
  type SkillsSettings,
} from '@/skills'
import {
  ALL_AGENT_ACTION_TYPES,
  FORCED_APPROVAL_ACTIONS,
  normalizeAgentDesktopSettings,
} from '../../../settings/agentDesktopSettings'
import type {
  AgentActionType,
  AgentActionClassification,
  AgentDesktopSettings,
} from '../../../electron/types'
import { Monitor } from '../../icons'
import { AgentDesktopDisclosureDialog } from './AgentDesktopDisclosureDialog'

export interface AgentDesktopSectionProps {
  /**
   * Persisted Agent Desktop preferences. Undefined until the user first
   * interacts; normalized to the safe disabled default for rendering.
   */
  agentDesktop: AgentDesktopSettings | undefined
  /** Skills map, used to mirror `skills.agent_desktop.enabled` (dual source of truth). */
  skills: SkillsSettings
  onChange: (changes: { agentDesktop?: AgentDesktopSettings; skills?: SkillsSettings }) => void
}

/** Human-readable label + description for each agent action type. */
const ACTION_META: Record<AgentActionType, { label: string; description: string }> = {
  screenshot: { label: 'Screenshot', description: 'Capture the Agent Desktop screen.' },
  list_windows: { label: 'List windows', description: 'Enumerate windows on the Agent Desktop.' },
  find_app: { label: 'Find app', description: 'Locate an application by name.' },
  cursor_position: { label: 'Cursor position', description: 'Read the current pointer location.' },
  click: { label: 'Click', description: 'Press the mouse on the Agent Desktop.' },
  type: { label: 'Type text', description: 'Send keyboard text input.' },
  key: { label: 'Key press', description: 'Send a key or key combination.' },
  scroll: { label: 'Scroll', description: 'Scroll a window or surface.' },
  launch_app: { label: 'Launch app', description: 'Start a new application.' },
  close_app: { label: 'Close app', description: 'Close an Agent Window.' },
}

const FORCED_APPROVAL_SET = new Set<AgentActionType>(FORCED_APPROVAL_ACTIONS)

/**
 * Computer Use settings panel.
 *
 * Provides the disclosure-gated enable toggle (Req 12.1, 12.2), the persistence
 * mode (Req 10.4), and the per-action approval-policy editor (Req 10.5). The
 * enable toggle mirrors `skills.agent_desktop.enabled` (dual source of truth,
 * same pattern as Memory). Windows-only: the parent hides this section on macOS
 * (Req 9.3); `launch_app` / `close_app` stay `approval-required` and cannot be
 * downgraded here (Req 5.5).
 */
export function AgentDesktopSection({
  agentDesktop,
  skills,
  onChange,
}: AgentDesktopSectionProps): React.ReactElement {
  const settings = normalizeAgentDesktopSettings(agentDesktop)
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const separateDesktopEnabled = settings.enabled && isAgentDesktopEnabled(skills)
  const thisDesktopEnabled = isSkillEnabled(skills, 'computer_use') && !separateDesktopEnabled

  const applySeparateDesktopSettings = (changes: Partial<AgentDesktopSettings>) => {
    const next: AgentDesktopSettings = { ...settings, ...changes }
    const payload: { agentDesktop: AgentDesktopSettings; skills?: SkillsSettings } = {
      agentDesktop: next,
    }
    // Mirror the enable bit into the skills map only when it actually changes,
    // so adjusting policy/persistence never marks the skills map dirty.
    if (typeof changes.enabled === 'boolean' && changes.enabled !== isAgentDesktopEnabled(skills)) {
      payload.skills = withAgentDesktopEnabled(skills, next.enabled)
    }
    onChange(payload)
  }

  const handleThisDesktopChange = (enabled: boolean) => {
    const nextSkills = withAgentDesktopEnabled(withComputerUseEnabled(skills, enabled), false)
    onChange({
      skills: nextSkills,
      agentDesktop: enabled ? { ...settings, enabled: false } : settings,
    })
  }

  const handleSeparateDesktopChange = (enabled: boolean) => {
    if (!enabled) {
      onChange({
        agentDesktop: { ...settings, enabled: false },
        skills: withAgentDesktopEnabled(skills, false),
      })
      return
    }
    // Enabling requires the not-a-sandbox disclosure to be acknowledged first.
    if (!settings.disclosureAcknowledged) {
      setDisclosureOpen(true)
      return
    }
    onChange({
      agentDesktop: { ...settings, enabled: true },
      skills: withComputerUseEnabled(withAgentDesktopEnabled(skills, true), false),
    })
  }

  const handleAcknowledge = () => {
    setDisclosureOpen(false)
    onChange({
      agentDesktop: { ...settings, disclosureAcknowledged: true, enabled: true },
      skills: withComputerUseEnabled(withAgentDesktopEnabled(skills, true), false),
    })
  }

  const handleCancel = () => {
    // Decline/dismiss: leave the skill disabled and unacknowledged (Req 12.2).
    setDisclosureOpen(false)
  }

  const updatePolicy = (action: AgentActionType, classification: AgentActionClassification) => {
    applySeparateDesktopSettings({
      approvalPolicy: {
        ...settings.approvalPolicy,
        [action]: classification,
      },
    })
  }

  const controlsDisabled = !separateDesktopEnabled

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Computer Use</h2>
        <div className="page-subtitle">
          Choose whether desktop-control actions run on this desktop or on a separate Windows
          virtual desktop, then tune approvals for the separate desktop mode.
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
                Desktop target
              </span>
            </div>
          </div>

          <p className="max-w-[70ch] text-sm leading-6 text-muted-foreground">
            Both modes use the same Computer Use tools: screenshots, clicks, typing, scrolling,
            and app controls. Separate desktop mode keeps agent windows off your working desktop,
            but it is workspace separation, not a sandbox.
          </p>

          <div className="space-y-4">
            <DetailField
              label="Control this desktop"
              description="Use Computer Use on the desktop you are currently using."
              control={
                <Switch
                  className="provider-hub-toggle"
                  checked={thisDesktopEnabled}
                  onCheckedChange={handleThisDesktopChange}
                  aria-label="Enable control this desktop"
                />
              }
            />
            <DetailField
              label="Control separate desktop"
              description="Use Computer Use on a dedicated Windows virtual desktop so agent windows stay off your working desktop."
              control={
                <Switch
                  className="provider-hub-toggle"
                  checked={separateDesktopEnabled}
                  onCheckedChange={handleSeparateDesktopChange}
                  aria-label="Enable control separate desktop"
                />
              }
            />
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            <div className="settings-list-row__label">Separate desktop options</div>
            <div className="settings-list-row__description max-w-[70ch]">
              All Windows virtual desktops share the same filesystem, registry, clipboard, network,
              and input session. Approvals, the kill switch, the per-session action cap, and
              window-targeting limits are the real safeguards.
            </div>
            <DetailField
              label="Persistence"
              description="Keep the separate desktop between sessions, or remove it automatically when its last agent window closes."
              control={
                <Select
                  value={settings.persistence}
                  onValueChange={(value) =>
                    applySeparateDesktopSettings({ persistence: value === 'persist' ? 'persist' : 'ephemeral' })
                  }
                  disabled={controlsDisabled}
                >
                  <SelectTrigger aria-label="Separate desktop persistence mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ephemeral">Remove when last window closes</SelectItem>
                    <SelectItem value="persist">Persist between sessions</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            <div className="settings-list-row__label">Approval policy</div>
            <div className="settings-list-row__description max-w-[70ch]">
              Choose which actions run automatically and which require your approval each time.
              Launching and closing apps always require approval and cannot be changed.
            </div>

            <div className="space-y-4 pt-2">
              {ALL_AGENT_ACTION_TYPES.map((action) => {
                const forced = FORCED_APPROVAL_SET.has(action)
                const meta = ACTION_META[action]
                return (
                  <DetailField
                    key={action}
                    label={meta.label}
                    description={
                      forced ? `${meta.description} Always requires approval.` : meta.description
                    }
                    control={
                      <Select
                        value={settings.approvalPolicy[action]}
                        onValueChange={(value) =>
                          updatePolicy(action, value as AgentActionClassification)
                        }
                        disabled={controlsDisabled || forced}
                      >
                        <SelectTrigger aria-label={`Approval policy for ${meta.label}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto-approve">Auto-approve</SelectItem>
                          <SelectItem value="approval-required">Approval required</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      <AgentDesktopDisclosureDialog
        open={disclosureOpen}
        onAcknowledge={handleAcknowledge}
        onCancel={handleCancel}
      />
    </div>
  )
}

export default AgentDesktopSection

function DetailField({
  label,
  description,
  control,
}: {
  label: string
  description: React.ReactNode
  control: React.ReactNode
}): React.ReactElement {
  return (
    <div className="settings-list-row settings-list-row--field provider-hub-detail-field">
      <div className="settings-list-row__meta">
        <div className="settings-list-row__label">{label}</div>
        <div className="settings-list-row__description">{description}</div>
      </div>
      <div className="settings-list-row__control settings-list-row__control--stretch provider-hub-detail-field__control">
        {control}
      </div>
    </div>
  )
}
