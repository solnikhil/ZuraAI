import React from 'react'
import { Check, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SkillLogo } from '@/components/shared'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

export interface SkillsSectionProps {
  skills: SkillsSettings
  codeExecutionAutoApprove: boolean
  terminalAutoApprove: boolean
  computerUseAutoApprove: boolean
  onChange: (changes: { skills?: SkillsSettings; codeExecutionAutoApprove?: boolean; terminalAutoApprove?: boolean; computerUseAutoApprove?: boolean }) => void
}

interface SkillCatalogGroupProps {
  title: string
  skills: BuiltInSkill[]
  isEnabled: (skillId: SkillId) => boolean
  setEnabled: (skillId: SkillId, enabled: boolean) => void
  codeExecutionAutoApprove: boolean
  terminalAutoApprove: boolean
  computerUseAutoApprove: boolean
  onChange: SkillsSectionProps['onChange']
  featured?: boolean
}

export function SkillsSection({
  skills,
  codeExecutionAutoApprove,
  terminalAutoApprove,
  computerUseAutoApprove,
  onChange,
}: SkillsSectionProps): React.ReactElement {
  const isEnabled = (skillId: SkillId): boolean => checkSkillEnabled(skills, skillId)
  const visibleSkills = isMacOSRuntime()
    ? BUILT_IN_SKILLS.filter((skill) => skill.id !== 'computer_use' && skill.id !== 'terminal')
    : BUILT_IN_SKILLS
  const recommendedSkills = visibleSkills.filter((skill) => skill.id === 'web_research' || skill.id === 'artifacts')
  const systemSkills = visibleSkills.filter((skill) => skill.id !== 'web_research' && skill.id !== 'artifacts')

  const setEnabled = (skillId: SkillId, enabled: boolean) => {
    if (skillId === 'computer_use') {
      onChange({
        skills: withComputerUseEnabled(skills, enabled),
      })
      return
    }

    onChange({
      skills: withSkillEnabled(skills, skillId, enabled),
    })
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
        <SkillCatalogGroup
          title="Recommended"
          skills={recommendedSkills}
          isEnabled={isEnabled}
          setEnabled={setEnabled}
          codeExecutionAutoApprove={codeExecutionAutoApprove}
          terminalAutoApprove={terminalAutoApprove}
          computerUseAutoApprove={computerUseAutoApprove}
          onChange={onChange}
          featured
        />
        <SkillCatalogGroup
          title="System"
          skills={systemSkills}
          isEnabled={isEnabled}
          setEnabled={setEnabled}
          codeExecutionAutoApprove={codeExecutionAutoApprove}
          terminalAutoApprove={terminalAutoApprove}
          computerUseAutoApprove={computerUseAutoApprove}
          onChange={onChange}
        />
      </div>

    </div>
  )
}

function SkillCatalogGroup({
  title,
  skills,
  isEnabled,
  setEnabled,
  codeExecutionAutoApprove,
  terminalAutoApprove,
  computerUseAutoApprove,
  onChange,
  featured = false,
}: SkillCatalogGroupProps): React.ReactElement | null {
  if (skills.length === 0) return null

  return (
    <section className="skills-catalog-group">
      <div className="skills-catalog-group__header">
        <h3>{title}</h3>
      </div>
      <div className={`skills-catalog-group__grid ${featured ? 'skills-catalog-group__grid--featured' : ''}`}>
        {skills.map((skill) => {
          const enabled = isEnabled(skill.id)
          const hasOptions = enabled && (skill.id === 'code_execution' || skill.id === 'terminal' || skill.id === 'computer_use')
          const logoSize = ['web_research', 'code_execution', 'terminal', 'computer_use', 'chart_generation'].includes(skill.id)
            ? 40
            : featured ? 22 : 18

          return (
            <div key={skill.id} className="skills-catalog-row">
              <button
                type="button"
                className="skills-catalog-row__main"
                onClick={() => setEnabled(skill.id, !enabled)}
                aria-pressed={enabled}
              >
                <span className={`skills-catalog-row__logo ${enabled ? 'skills-catalog-row__logo--enabled' : ''}`}>
                  <SkillLogo skill={skill.id} size={logoSize} />
                </span>
                <span className="skills-catalog-row__content">
                  <span className="skills-catalog-row__title">{skill.name}</span>
                  <span className="skills-catalog-row__description">{skill.description}</span>
                </span>
              </button>

              <div className="skills-catalog-row__actions">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`skills-catalog-row__toggle ${enabled ? 'skills-catalog-row__toggle--enabled' : ''}`}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${skill.name}`}
                  onClick={() => setEnabled(skill.id, !enabled)}
                >
                  {enabled ? <Check size={15} /> : <Plus size={16} />}
                </Button>

                {hasOptions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="skills-catalog-row__menu"
                        aria-label={`More actions for ${skill.name}`}
                      >
                        <MoreHorizontal size={15} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="zura-menu-surface--compact">
                      <DropdownMenuItem className="zura-menu-item--compact" onClick={() => setEnabled(skill.id, false)}>
                        Disable
                      </DropdownMenuItem>
                      {skill.id === 'code_execution' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            className="zura-menu-item--compact"
                            checked={codeExecutionAutoApprove}
                            onCheckedChange={() => onChange({ codeExecutionAutoApprove: !codeExecutionAutoApprove })}
                          >
                            Auto-approve execution
                          </DropdownMenuCheckboxItem>
                        </>
                      )}
                      {skill.id === 'terminal' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            className="zura-menu-item--compact"
                            checked={terminalAutoApprove}
                            onCheckedChange={() => onChange({ terminalAutoApprove: !terminalAutoApprove })}
                          >
                            Auto-approve execution
                          </DropdownMenuCheckboxItem>
                        </>
                      )}
                      {skill.id === 'computer_use' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            className="zura-menu-item--compact"
                            checked={computerUseAutoApprove}
                            onCheckedChange={() => onChange({ computerUseAutoApprove: !computerUseAutoApprove })}
                          >
                            Auto-approve actions
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuLabel>
                            Kill switch: Esc+Esc
                          </DropdownMenuLabel>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default SkillsSection
