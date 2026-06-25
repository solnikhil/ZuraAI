import { useEffect, useMemo, useRef } from 'react'
import { useSettings } from '@/contexts/SettingsContext'

export default function AgentSkillsSync(): null {
  const { settings, updateSettings } = useSettings()
  const inFlightKeyRef = useRef('')

  const disabledSkillNamesKey = useMemo(
    () => [...settings.agentSkills.disabledSkillNames].sort().join('\n'),
    [settings.agentSkills.disabledSkillNames]
  )
  const catalogKey = useMemo(
    () => settings.agentSkills.catalog.map((skill) => `${skill.scope}:${skill.name}:${skill.description}`).join('\n'),
    [settings.agentSkills.catalog]
  )

  useEffect(() => {
    const currentAgentSkills = settings.agentSkills
    if (!settings.agentSkills.enabled || !window.agentSkills?.list) {
      if (settings.agentSkills.catalog.length > 0) {
        updateSettings({
          agentSkills: {
            ...currentAgentSkills,
            catalog: [],
          },
        })
      }
      return
    }

    const requestKey = `${settings.agentSkills.projectRoot}\n${disabledSkillNamesKey}`
    inFlightKeyRef.current = requestKey
    let cancelled = false

    void window.agentSkills
      .list({
        projectRoot: settings.agentSkills.projectRoot,
        disabledSkillNames: settings.agentSkills.disabledSkillNames,
      })
      .then((result) => {
        if (cancelled || inFlightKeyRef.current !== requestKey) return
        const nextCatalogKey = result.skills.map((skill) => `${skill.scope}:${skill.name}:${skill.description}`).join('\n')
        if (nextCatalogKey === catalogKey) return
        updateSettings({
          agentSkills: {
            ...currentAgentSkills,
            catalog: result.skills,
          },
        })
      })
      .catch((error) => {
        console.error('[AgentSkillsSync] Failed to refresh Agent Skills catalog:', error)
      })

    return () => {
      cancelled = true
    }
  }, [
    catalogKey,
    disabledSkillNamesKey,
    settings.agentSkills.enabled,
    settings.agentSkills.projectRoot,
    updateSettings,
  ])

  return null
}
