import React, { useEffect, useMemo, useState } from 'react'
import { Check, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SkillLogo } from '@/components/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { OverlaySettings } from '@/contexts/SettingsConfigContext'
import type { Settings } from '@/contexts/SettingsContext'
import type { EmailNotificationSettings } from '@/electron/types'
import {
  BUILT_IN_SKILLS,
  isSkillEnabled as checkSkillEnabled,
  withComputerUseEnabled,
  withSkillEnabled,
  type BuiltInSkill,
  type SkillId,
  type SkillsSettings,
} from '@/skills'
import { isMacOSRuntime } from '@/utils/platform'
import { ExtensionConfigDialog } from './ExtensionConfigDialog'
import {
  OVERLAY_CATALOG_EXTENSION,
  type CatalogExtensionId,
} from './extensionCatalog'

export interface SkillsSectionProps {
  skills: SkillsSettings
  overlay?: OverlaySettings
  settings?: Settings
  codeExecutionAutoApprove: boolean
  terminalAutoApprove: boolean
  computerUseAutoApprove: boolean
  brevoApiKey?: string
  emailNotifications?: EmailNotificationSettings
  hasUnsavedChanges?: boolean
  initialExtension?: CatalogExtensionId
  initialExtensionPanel?: 'notifications'
  onExtensionNavigationConsumed?: () => void
  onChange: (changes: {
    skills?: SkillsSettings
    overlay?: OverlaySettings
    codeExecutionAutoApprove?: boolean
    terminalAutoApprove?: boolean
    computerUseAutoApprove?: boolean
    memoryModel?: string
    brevoApiKey?: string
    emailNotifications?: EmailNotificationSettings
  }) => void
}

interface CatalogRow {
  id: CatalogExtensionId
  name: string
  description: string
}

interface ExtensionCatalogGroupProps {
  title: string
  rows: CatalogRow[]
  isEnabled: (extensionId: CatalogExtensionId) => boolean
  setEnabled: (extensionId: CatalogExtensionId, enabled: boolean) => void
  onConfigure: (extensionId: CatalogExtensionId) => void
  featured?: boolean
}

export function SkillsSection({
  skills,
  overlay,
  settings,
  codeExecutionAutoApprove,
  terminalAutoApprove,
  computerUseAutoApprove,
  brevoApiKey,
  emailNotifications,
  hasUnsavedChanges,
  initialExtension,
  initialExtensionPanel,
  onExtensionNavigationConsumed,
  onChange,
}: SkillsSectionProps): React.ReactElement {
  const [activeExtension, setActiveExtension] = useState<CatalogExtensionId | null>(
    initialExtension ?? null
  )
  const [activeExtensionPanel, setActiveExtensionPanel] = useState<'notifications' | undefined>(
    initialExtensionPanel
  )

  useEffect(() => {
    if (!initialExtension) return
    setActiveExtension(initialExtension)
    setActiveExtensionPanel(initialExtensionPanel)
    onExtensionNavigationConsumed?.()
  }, [initialExtension, initialExtensionPanel, onExtensionNavigationConsumed])

  const isEnabled = (extensionId: CatalogExtensionId): boolean => {
    if (extensionId === 'overlay') {
      return overlay?.enabled ?? false
    }
    return checkSkillEnabled(skills, extensionId)
  }

  const visibleSkills = isMacOSRuntime()
    ? BUILT_IN_SKILLS.filter((skill) => skill.id !== 'computer_use' && skill.id !== 'terminal')
    : BUILT_IN_SKILLS

  const recommendedRows = useMemo((): CatalogRow[] => {
    const rows = visibleSkills
      .filter((skill) => skill.id === 'web_research' || skill.id === 'artifacts')
      .map(toCatalogRow)

    if (!isMacOSRuntime()) {
      rows.push(OVERLAY_CATALOG_EXTENSION)
    }

    return rows
  }, [visibleSkills])

  const systemRows = useMemo(
    () =>
      visibleSkills
        .filter((skill) => skill.id !== 'web_research' && skill.id !== 'artifacts')
        .map(toCatalogRow),
    [visibleSkills]
  )

  const setEnabled = (extensionId: CatalogExtensionId, enabled: boolean) => {
    if (extensionId === 'overlay') {
      if (!overlay) return
      onChange({
        overlay: {
          ...overlay,
          enabled,
        },
      })
      return
    }

    if (extensionId === 'computer_use') {
      onChange({
        skills: withComputerUseEnabled(skills, enabled),
      })
      return
    }

    onChange({
      skills: withSkillEnabled(skills, extensionId, enabled),
    })
  }

  const openExtensionConfig = (extensionId: CatalogExtensionId) => {
    setActiveExtension(extensionId)
    setActiveExtensionPanel(undefined)
  }

  const closeExtensionConfig = () => {
    setActiveExtension(null)
    setActiveExtensionPanel(undefined)
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Extensions</h2>
        <div className="page-subtitle">
          Enable built-in extensions that let the assistant search, create artifacts, run tools, and more.
        </div>
      </div>

      <div className="skills-catalog" aria-label="Built-in extensions">
        <ExtensionCatalogGroup
          title="Recommended"
          rows={recommendedRows}
          isEnabled={isEnabled}
          setEnabled={setEnabled}
          onConfigure={openExtensionConfig}
          featured
        />
        <ExtensionCatalogGroup
          title="System"
          rows={systemRows}
          isEnabled={isEnabled}
          setEnabled={setEnabled}
          onConfigure={openExtensionConfig}
        />
      </div>

      <ExtensionConfigDialog
        open={activeExtension !== null}
        extensionId={activeExtension}
        skills={skills}
        overlay={overlay}
        settings={settings}
        codeExecutionAutoApprove={codeExecutionAutoApprove}
        terminalAutoApprove={terminalAutoApprove}
        computerUseAutoApprove={computerUseAutoApprove}
        brevoApiKey={brevoApiKey}
        emailNotifications={emailNotifications}
        hasUnsavedChanges={hasUnsavedChanges}
        initialPanel={activeExtensionPanel}
        isEnabled={isEnabled}
        setEnabled={setEnabled}
        onChange={onChange}
        onOpenChange={(open) => {
          if (!open) closeExtensionConfig()
        }}
      />
    </div>
  )
}

function toCatalogRow(skill: BuiltInSkill): CatalogRow {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
  }
}

function ExtensionCatalogGroup({
  title,
  rows,
  isEnabled,
  setEnabled,
  onConfigure,
  featured = false,
}: ExtensionCatalogGroupProps): React.ReactElement | null {
  if (rows.length === 0) return null

  return (
    <section className="skills-catalog-group">
      <div className="skills-catalog-group__header">
        <h3>{title}</h3>
      </div>
      <div className={`skills-catalog-group__grid ${featured ? 'skills-catalog-group__grid--featured' : ''}`}>
        {rows.map((row) => {
          const enabled = isEnabled(row.id)
          const logoSize = ['web_research', 'code_execution', 'terminal', 'computer_use', 'chart_generation'].includes(row.id)
            ? 40
            : featured ? 22 : 18

          return (
            <div key={row.id} className="skills-catalog-row">
              <button
                type="button"
                className="skills-catalog-row__main"
                onClick={() => setEnabled(row.id, !enabled)}
                aria-pressed={enabled}
              >
                <span className={`skills-catalog-row__logo ${enabled ? 'skills-catalog-row__logo--enabled' : ''}`}>
                  <SkillLogo skill={row.id} size={logoSize} />
                </span>
                <span className="skills-catalog-row__content">
                  <span className="skills-catalog-row__title">{row.name}</span>
                  <span className="skills-catalog-row__description">{row.description}</span>
                </span>
              </button>

              <div className="skills-catalog-row__actions">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`skills-catalog-row__toggle ${enabled ? 'skills-catalog-row__toggle--enabled' : ''}`}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${row.name}`}
                  onClick={() => setEnabled(row.id, !enabled)}
                >
                  {enabled ? <Check size={15} /> : <Plus size={16} />}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="skills-catalog-row__menu"
                      aria-label={`More actions for ${row.name}`}
                    >
                      <MoreHorizontal size={15} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="settings-menu-surface zura-menu-surface--compact">
                    <DropdownMenuItem
                      className="zura-menu-item--compact"
                      onClick={() => onConfigure(row.id)}
                    >
                      Configure
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="zura-menu-item--compact"
                      onClick={() => setEnabled(row.id, !enabled)}
                    >
                      {enabled ? 'Disable' : 'Enable'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default SkillsSection