import React, { useMemo, useState } from 'react'
import { Check, Globe, MoreHorizontal, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import {
  BUILT_IN_SKILLS,
  getWebResearchMode,
  isWebResearchEnabled,
  normalizeWebResearchMode,
  withWebResearchEnabled,
  withWebResearchMode,
  type SkillsSettings,
  type WebResearchMode,
} from '@/skills'

export interface SkillsSectionProps {
  skills: SkillsSettings
  onChange: (changes: { skills: SkillsSettings }) => void
}

export function SkillsSection({ skills, onChange }: SkillsSectionProps): React.ReactElement {
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const webResearchEnabled = isWebResearchEnabled(skills)
  const webResearchMode = getWebResearchMode(skills)

  const editingSkill = useMemo(
    () => BUILT_IN_SKILLS.find((skill) => skill.id === editingSkillId),
    [editingSkillId],
  )

  const setEnabled = (enabled: boolean) => {
    onChange({
      skills: withWebResearchEnabled(skills, enabled),
    })
  }

  const setMode = (mode: WebResearchMode) => {
    onChange({
      skills: withWebResearchMode(skills, mode),
    })
  }

  const isSkillEnabled = (skillId: string): boolean => {
    if (skillId === 'web_research') return webResearchEnabled
    return false
  }

  const openModifyDialog = (skillId: string) => {
    setEditingSkillId(skillId)
  }

  const closeModifyDialog = () => {
    setEditingSkillId(null)
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
            const skillIcon = skill.id === 'web_research' ? <Search size={17} /> : <Globe size={17} />

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
                    {enabled ? 'Installed' : 'Disabled'}
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
                      <DropdownMenuItem onClick={() => openModifyDialog(skill.id)}>
                        Modify
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEnabled(!enabled)}>
                        {enabled ? 'Disable' : 'Enable'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!enabled}
                        onClick={() => setMode('normal')}
                      >
                        {webResearchMode === 'normal' && <Check size={14} />}
                        Normal Mode
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!enabled}
                        onClick={() => setMode('structured')}
                      >
                        {webResearchMode === 'structured' && <Check size={14} />}
                        Structured Mode
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Dialog open={editingSkill != null} onOpenChange={(open) => { if (!open) closeModifyDialog() }}>
        <DialogContent className="border-border bg-card sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingSkill?.name || 'Modify Skill'}</DialogTitle>
            <DialogDescription>
              Configure how this built-in skill behaves. Changes are staged until you save Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <div className="text-sm text-foreground">{editingSkill?.description}</div>
              <div className="mt-1 text-xs text-muted-foreground">{editingSkill?.note}</div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium text-foreground">Enable Skill</div>
                <div className="text-xs text-muted-foreground">Expose this skill to the model at runtime.</div>
              </div>
              <Switch
                checked={webResearchEnabled}
                onCheckedChange={setEnabled}
                aria-label="Enable Web Research skill"
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-foreground">Mode</div>
              <div className="mb-2 text-xs text-muted-foreground">
                Normal exposes <code>web_search</code>. Structured exposes <code>web_search</code> + <code>research_plan</code>.
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['normal', 'structured'] as const).map((mode) => {
                  const selected = webResearchMode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={!webResearchEnabled}
                      onClick={() => setMode(normalizeWebResearchMode(mode))}
                      className="rounded-md border px-3 py-2 text-left text-sm transition"
                      style={{
                        borderColor: selected ? 'var(--theme-accent)' : 'var(--theme-border)',
                        background: selected ? 'var(--theme-surface-active)' : 'var(--theme-surface)',
                        color: 'var(--theme-text-primary)',
                        opacity: webResearchEnabled ? 1 : 0.55,
                        cursor: webResearchEnabled ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <div className="font-medium capitalize">{mode}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {mode === 'normal'
                          ? 'Model drives web_search depth directly.'
                          : 'Model starts with research_plan, then executes searches.'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <Card className="settings-section-card skills-marketplace-note">
        <div className="skills-marketplace-note__text">
          Built-in skills only. There is no marketplace in this app version.
        </div>
      </Card>
    </div>
  )
}

export default SkillsSection
