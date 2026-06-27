import { BUILT_IN_SKILLS, type SkillId } from '@/skills'

export type CatalogExtensionId = SkillId | 'overlay'

export interface CatalogExtensionEntry {
  id: CatalogExtensionId
  name: string
  description: string
}

export const OVERLAY_CATALOG_EXTENSION: CatalogExtensionEntry = {
  id: 'overlay',
  name: 'Overlay',
  description:
    'Open a Siri/Spotlight-style desktop chat surface docked to the top-right corner.',
}

export function getCatalogExtension(
  id: CatalogExtensionId
): CatalogExtensionEntry | undefined {
  if (id === 'overlay') return OVERLAY_CATALOG_EXTENSION

  const skill = BUILT_IN_SKILLS.find((entry) => entry.id === id)
  if (!skill) return undefined

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
  }
}

export function isCatalogExtensionId(value: string): value is CatalogExtensionId {
  return value === 'overlay' || BUILT_IN_SKILLS.some((skill) => skill.id === value)
}