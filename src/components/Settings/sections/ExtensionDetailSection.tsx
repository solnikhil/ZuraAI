import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SkillLogo } from '@/components/shared'
import type { Settings } from '@/contexts/SettingsContext'
import type { EmailNotificationSettings } from '@/electron/types'
import { BUILT_IN_SKILLS, type BuiltInSkill, type SkillId, type SkillsSettings } from '@/skills'
import { getCatalogExtension, type CatalogExtensionId } from './extensionCatalog'
import { MemorySection } from './MemorySection'
import { NotificationsSection } from './NotificationsSection'
import { AgentTrustedActionsCard } from './AgentTrustedActionsCard'

export interface ExtensionDetailSectionProps {
  extensionId: CatalogExtensionId
  skills: SkillsSettings
  settings?: Settings
  brevoApiKey?: string
  emailNotifications?: EmailNotificationSettings
  isSavingSecureSettings?: boolean
  initialPanel?: 'notifications'
  isEnabled: (extensionId: CatalogExtensionId) => boolean
  setEnabled: (extensionId: CatalogExtensionId, enabled: boolean) => void | Promise<void>
  onChange: (changes: {
    skills?: SkillsSettings
    assistantMode?: Settings['assistantMode']
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
  brevoApiKey = '',
  emailNotifications,
  isSavingSecureSettings = false,
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
        <span
          className={`extension-detail__logo ${enabled ? 'extension-detail__logo--enabled' : ''}`}
        >
          <SkillLogo skill={extensionId} size={40} />
        </span>
        <div className="extension-detail__meta">
          <h2 className="extension-detail__title">{catalogEntry.name}</h2>
          <p className="extension-detail__description">{catalogEntry.description}</p>
        </div>
        <div className="extension-detail__enable">
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => void setEnabled(extensionId, checked)}
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
              isSavingSecureSettings={isSavingSecureSettings}
              onChange={(changes) => onChange(changes)}
            />
          </div>
        </>
      ) : extensionId === 'computer_use' ? (
        <>
          {skill ? <ExtensionInfoCard skill={skill} /> : null}
          <AgentModeAutonomyCard enabled={enabled} />
          <AgentTrustedActionsCard />
          <Card className="settings-list-card extension-detail__note-card">
            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Emergency stop</h3>
                <div className="settings-list-row__description">
                  Press Esc twice quickly to cancel an in-progress Computer Use session.
                </div>
              </div>
            </div>
          </Card>
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

function AgentModeAutonomyCard({ enabled }: { enabled: boolean }): React.ReactElement {
  const [autonomous, setAutonomous] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const activeAutonomy = enabled && autonomous
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    let active = true
    void window.agentApproval
      ?.getAutonomousMode()
      .then((state) => {
        if (active) setAutonomous(state.enabled)
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Autonomous mode is unavailable.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    if (!window.agentApproval) setLoading(false)
    return () => {
      active = false
      mountedRef.current = false
    }
  }, [])

  const setMode = async (nextEnabled: boolean) => {
    if (!window.agentApproval) {
      setError('Autonomous mode is available only in the desktop app.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const state = await window.agentApproval.setAutonomousMode(nextEnabled)
      if (mountedRef.current) setAutonomous(state.enabled)
    } catch (cause) {
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : 'Autonomous mode could not be updated.')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  return (
    <Card
      className="settings-list-card extension-detail__autonomy-card"
      data-active={activeAutonomy ? 'true' : 'false'}
    >
      <div className="settings-list-row">
        <div className="settings-list-row__meta">
          <div className="extension-detail__autonomy-heading">
            <AlertTriangle size={15} aria-hidden="true" />
            <h3 className="settings-list-row__label">Fully autonomous mode</h3>
          </div>
          <div className="settings-list-row__description">
            Automatically approve Agent Mode tool actions, including terminal commands, code,
            desktop control, file changes, app actions, and MCP tools.
          </div>
          <div className="extension-detail__autonomy-warning">
            ZuraAI will ask for one native confirmation before enabling this. Tool validation,
            bounded execution, and Esc+Esc emergency stop remain active.
          </div>
          {error ? (
            <div className="extension-detail__autonomy-error" role="status">
              {error}
            </div>
          ) : null}
        </div>
        <div className="settings-list-row__control">
          <Switch
            checked={activeAutonomy}
            disabled={!enabled || loading}
            onCheckedChange={(checked) => void setMode(checked)}
            aria-label="Fully autonomous mode"
          />
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
