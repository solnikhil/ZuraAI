import React, { useEffect, useRef } from 'react'
import { Command } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SkillLogo } from '@/components/shared'
import type { Settings } from '@/contexts/SettingsContext'
import type { EmailNotificationSettings } from '@/electron/types'
import {
  BUILT_IN_SKILLS,
  type BuiltInSkill,
  type SkillId,
  type SkillsSettings,
} from '@/skills'
import { getCatalogExtension, type CatalogExtensionId } from './extensionCatalog'
import { MemorySection } from './MemorySection'
import { NotificationsSection } from './NotificationsSection'

export interface ExtensionDetailSectionProps {
  extensionId: CatalogExtensionId
  skills: SkillsSettings
  settings?: Settings
  codeExecutionAutoApprove: boolean
  terminalAutoApprove: boolean
  computerUseAutoApprove: boolean
  brevoApiKey?: string
  emailNotifications?: EmailNotificationSettings
  hasUnsavedChanges?: boolean
  initialPanel?: 'notifications'
  isEnabled: (extensionId: CatalogExtensionId) => boolean
  setEnabled: (extensionId: CatalogExtensionId, enabled: boolean) => void
  onChange: (changes: {
    skills?: SkillsSettings
    codeExecutionAutoApprove?: boolean
    terminalAutoApprove?: boolean
    computerUseAutoApprove?: boolean
    commandCenterChatPersistence?: Settings['commandCenterChatPersistence']
    memoryModel?: string
    brevoApiKey?: string
    emailNotifications?: EmailNotificationSettings
  }) => void
}

function getBuiltInSkill(extensionId: SkillId): BuiltInSkill | undefined {
  return BUILT_IN_SKILLS.find((skill) => skill.id === extensionId)
}

export function ExtensionDetailSection({
  extensionId,
  skills,
  settings,
  codeExecutionAutoApprove,
  terminalAutoApprove,
  computerUseAutoApprove,
  brevoApiKey = '',
  emailNotifications,
  hasUnsavedChanges = false,
  initialPanel,
  isEnabled,
  setEnabled,
  onChange,
}: ExtensionDetailSectionProps): React.ReactElement | null {
  const catalogEntry = getCatalogExtension(extensionId)
  const skill = getBuiltInSkill(extensionId)
  const notificationsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (initialPanel !== 'notifications') return
    notificationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [extensionId, initialPanel])

  if (!catalogEntry) return null

  const enabled = isEnabled(extensionId)

  return (
    <div className="extension-detail">
      <div className="extension-detail__header">
        <span className={`extension-detail__logo ${enabled ? 'extension-detail__logo--enabled' : ''}`}>
          <SkillLogo skill={extensionId} size={40} />
        </span>
        <div className="extension-detail__meta">
          <h2 className="extension-detail__title">{catalogEntry.name}</h2>
          <p className="extension-detail__description">{catalogEntry.description}</p>
        </div>
        <div className="extension-detail__enable">
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(extensionId, checked)}
            aria-label={`${enabled ? 'Disable' : 'Enable'} ${catalogEntry.name}`}
          />
        </div>
      </div>

      {extensionId === 'memory' && settings ? (
        <MemorySection
          embedded
          skills={skills}
          settings={settings}
          onChange={(changes) => onChange(changes)}
        />
      ) : extensionId === 'reminders' && emailNotifications ? (
        <>
          {skill ? <ExtensionInfoCard skill={skill} /> : null}
          <div ref={notificationsRef} className="extension-detail__panel">
            <h3 className="appearance-group-heading">Email Delivery</h3>
            <NotificationsSection
              embedded
              brevoApiKey={brevoApiKey}
              emailNotifications={emailNotifications}
              hasUnsavedChanges={hasUnsavedChanges}
              onChange={(changes) => onChange(changes)}
            />
          </div>
        </>
      ) : extensionId === 'code_execution' ? (
        <ExtensionToggleCard
          label="Auto-approve execution"
          description="Skip the approval dialog for every code execution request."
          checked={codeExecutionAutoApprove}
          onCheckedChange={(checked) => onChange({ codeExecutionAutoApprove: checked })}
        />
      ) : extensionId === 'terminal' ? (
        <ExtensionToggleCard
          label="Auto-approve execution"
          description="Skip the approval dialog for every terminal command."
          checked={terminalAutoApprove}
          onCheckedChange={(checked) => onChange({ terminalAutoApprove: checked })}
        />
      ) : extensionId === 'computer_use' ? (
        <>
          <ExtensionToggleCard
            label="Auto-approve actions"
            description="Skip the approval dialog for desktop control actions."
            checked={computerUseAutoApprove}
            onCheckedChange={(checked) => onChange({ computerUseAutoApprove: checked })}
          />
          <Card className="settings-list-card extension-detail__note-card">
            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Emergency stop</h3>
                <div className="settings-list-row__description">
                  Agent Mode includes native Windows tools and Ctrl+Shift+Space Command Center. Press Esc twice quickly to cancel an in-progress Computer Use session.
                </div>
              </div>
            </div>
          </Card>
        </>
      ) : extensionId === 'command_center' ? (
        <>
          <Card className="settings-list-card">
            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Global shortcut</h3>
                <div className="settings-list-row__description">
                  Press Ctrl+Shift+Space to open the desktop overlay. Submitted commands include active-window context for Agent Mode.
                </div>
              </div>
              <div className="settings-list-row__control">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!enabled}
                  onClick={() => void window.commandCenter?.show()}
                >
                  <Command size={14} />
                  Open
                </Button>
              </div>
            </div>
          </Card>
          <Card className="settings-list-card">
            <div className="settings-list-row settings-list-row--stacked">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Quick OS actions</h3>
                <div className="settings-list-row__description">
                  The overlay can run only fixed shortcuts: snap left, snap right, maximize, set volume to 30% or 60%, toggle mute, toggle theme, show system status, ask about clipboard text, focus ZuraAI, open common Windows settings, and open Downloads. Model-callable OS tools still use the normal approval path where required.
                </div>
              </div>
            </div>
          </Card>
          {settings ? (
            <ExtensionToggleCard
              label="Save overlay chats"
              description="Store Command Center AI chats in normal chat history immediately. When off, they stay temporary until opened in Chat."
              checked={settings.commandCenterChatPersistence === 'always-save'}
              onCheckedChange={(checked) =>
                onChange({ commandCenterChatPersistence: checked ? 'always-save' : 'temporary' })
              }
            />
          ) : null}
        </>
      ) : skill ? (
        <ExtensionInfoCard skill={skill} />
      ) : null}

      {extensionId !== 'memory' && skill?.note ? (
        <Card className="settings-list-card extension-detail__note-card">
          <div className="settings-list-row">
            <div className="settings-list-row__meta">
              <h3 className="settings-list-row__label">Notes</h3>
              <div className="settings-list-row__description">{skill.note}</div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function ExtensionToggleCard({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.ReactElement {
  return (
    <Card className="settings-list-card">
      <div className="settings-list-row">
        <div className="settings-list-row__meta">
          <h3 className="settings-list-row__label">{label}</h3>
          <div className="settings-list-row__description">{description}</div>
        </div>
        <div className="settings-list-row__control">
          <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
        </div>
      </div>
    </Card>
  )
}

function ExtensionInfoCard({ skill }: { skill: BuiltInSkill }): React.ReactElement {
  return (
    <Card className="settings-list-card">
      <div className="settings-list-row settings-list-row--stacked">
        <div className="settings-list-row__meta">
          <h3 className="settings-list-row__label">How it works</h3>
          <div className="settings-list-row__description">
            <ul className="extension-detail__guidance-list">
              {skill.usageGuidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default ExtensionDetailSection
