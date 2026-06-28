import { BUILT_IN_SKILLS, type SkillId } from '@/skills'

export type CatalogExtensionId = SkillId

export interface CatalogExtensionEntry {
  id: CatalogExtensionId
  name: string
  description: string
}

export function getCatalogExtension(
  id: CatalogExtensionId
): CatalogExtensionEntry | undefined {
  const skill = BUILT_IN_SKILLS.find((entry) => entry.id === id)
  if (!skill) return undefined

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
  }
}

export function isCatalogExtensionId(value: string): value is CatalogExtensionId {
  return BUILT_IN_SKILLS.some((skill) => skill.id === value)
}
