import React, { useMemo, useState } from 'react'
import { Check, Globe, MoreHorizontal, Sparkles } from 'lucide-react'
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
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">Skills</h2>
        <div className="page-subtitle">Enable built-in capabilities that control tool access and agent behavior.</div>
      </div>

      <Card className="settings-section-card p-0">
        <div className="divide-y divide-border">
          {BUILT_IN_SKILLS.map((skill) => {
            const enabled = isSkillEnabled(skill.id)

            return (
              <div key={skill.id} className="flex items-center justify-between gap-3 px-4 py-4">
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: enabled ? 'rgba(77, 171, 247, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                      color: enabled ? '#4dabf7' : 'var(--theme-text-muted)',
                    }}
                  >
                    <Globe size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-medium text-foreground">{skill.name}</h3>
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                        <Sparkles size={11} />
                        Built-in
                      </span>
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{skill.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: enabled ? '#86efac' : 'var(--theme-text-muted)' }}
                  >
                    {enabled ? 'Installed' : 'Disabled'}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
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
              Configure how this built-in skill behaves. Changes apply immediately.
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

      <Card className="settings-section-card mt-6">
        <div className="text-sm text-muted-foreground">
          Built-in skills only. There is no marketplace in this app version.
        </div>
      </Card>
    </div>
  )
}

export default SkillsSection
