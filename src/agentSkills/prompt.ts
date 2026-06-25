import type { AgentSkillsSettings } from './types'

export function buildAgentSkillsCatalogPrompt(agentSkills?: AgentSkillsSettings): string {
  if (!agentSkills?.enabled || !Array.isArray(agentSkills.catalog) || agentSkills.catalog.length === 0) {
    return ''
  }

  const skills = agentSkills.catalog
    .filter((skill) => !agentSkills.disabledSkillNames.includes(skill.name))
    .map((skill) => `- ${skill.name} [${skill.scope}]: ${skill.description}`)

  if (skills.length === 0) return ''

  return `Agent Skills:
The following reusable skills provide specialized instructions for matching tasks. When a task matches a skill's description, call activate_skill with the exact skill name before proceeding. Skills can request tools, but ZuraAI's normal tool availability and approval rules still apply.
${skills.join('\n')}`
}
