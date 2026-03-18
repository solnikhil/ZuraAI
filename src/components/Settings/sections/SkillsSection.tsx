import React from 'react'
import { Info, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SkillLogo } from '@/components/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BUILT_IN_SKILLS,
  isWebResearchEnabled,
  withWebResearchEnabled,
  type SkillsSettings,
} from '@/skills'

export interface SkillsSectionProps {
  skills: SkillsSettings
  onChange: (changes: { skills: SkillsSettings }) => void
}

export function SkillsSection({ skills, onChange }: SkillsSectionProps): React.ReactElement {
  const webResearchEnabled = isWebResearchEnabled(skills)

  const setEnabled = (_skillId: string, enabled: boolean) => {
    onChange({
      skills: withWebResearchEnabled(skills, enabled),
    })
  }

  const isSkillEnabled = (skillId: string): boolean => {
    if (skillId === 'web_research') return webResearchEnabled
    return false
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Skills</h2>
        <div className="page-subtitle">
          Enable built-in capabilities that shape web research behavior and tool access.
        </div>
      </div>

      <Card className="settings-list-card settings-skills-card p-0">
        <div className="skills-list">
          {BUILT_IN_SKILLS.map((skill) => {
            const enabled = isSkillEnabled(skill.id)

            return (
              <div key={skill.id} className="skills-row">
                <div className="skills-row__main">
                  <div className={`skills-row__logo ${enabled ? 'skills-row__logo--enabled' : ''}`}>
                    <SkillLogo skill={skill.id} size={18} />
                  </div>
                  <div className="skills-row__content">
                    <h3 className="skills-row__title">{skill.name}</h3>
                    <div className="skills-row__description">{skill.description}</div>
                    {skill.note && <div className="skills-row__note">{skill.note}</div>}
                  </div>
                </div>

                <div className="skills-row__actions">
                  <span
                    className={`skills-row__status ${enabled ? 'skills-row__status--enabled' : 'skills-row__status--disabled'}`}
                  >
                    {enabled ? 'Active' : 'Disabled'}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="skills-row__menu"
                        aria-label={`More actions for ${skill.name}`}
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel inset>{skill.name}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setEnabled(skill.id, !enabled)}>
                        {enabled ? 'Disable' : 'Enable'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="settings-section-card skills-marketplace-note">
        <div className="skills-marketplace-note__inner">
          <Info size={15} className="skills-marketplace-note__icon" />
          <div className="skills-marketplace-note__text">
            Built-in skills only. Enable a skill here, then use it from chat.
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SkillsSection