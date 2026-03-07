import React from 'react'
import { Globe, Info, MoreHorizontal, Radar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

  const setEnabled = (enabled: boolean) => {
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
        <div className="page-subtitle">Enable built-in capabilities that control tool access and agent behavior.</div>
      </div>

      <Card className="settings-list-card settings-skills-card p-0">
        <div className="skills-list">
          {BUILT_IN_SKILLS.map((skill) => {
            const enabled = isSkillEnabled(skill.id)
            const skillIcon = skill.id === 'web_research' ? <Radar size={18} /> : <Globe size={18} />

            return (
              <div key={skill.id} className="skills-row">
                <div className="skills-row__main">
                  <div className={`skills-row__logo ${enabled ? 'skills-row__logo--enabled' : ''}`}>
                    {skillIcon}
                  </div>
                  <div className="skills-row__content">
                    <h3 className="skills-row__title">{skill.name}</h3>
                    <div className="skills-row__description">{skill.description}</div>
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
                      <DropdownMenuItem onClick={() => setEnabled(!enabled)}>
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
            Built-in skills only. There is no marketplace in this app version.
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SkillsSection
