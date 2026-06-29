import React, { useMemo, useState } from 'react'
import { Bell, Command, FileText, Globe, Terminal } from 'lucide-react'

export type SkillLogoSize = 'sm' | 'md' | 'lg'

export interface SkillLogoProps {
  skill: string
  size?: SkillLogoSize | number
  showFallback?: boolean
  className?: string
  style?: React.CSSProperties
}

const SIZE_MAP: Record<SkillLogoSize, number> = {
  sm: 14,
  md: 18,
  lg: 24,
}

const SKILL_ASSET_NAMES: Record<string, string> = {
  web_research: 'tavily',
  tavily: 'tavily',
}

interface CustomSkillLogoProps {
  size: number
  className?: string
  style?: React.CSSProperties
}

const SKILL_CUSTOM_LOGOS: Record<string, React.ComponentType<CustomSkillLogoProps>> = {}

const SKILL_FALLBACK_ICONS: Record<string, React.ComponentType<{ size?: number | string; color?: string }>> = {
  reminders: Bell,
  terminal: Terminal,
  artifacts: FileText,
  command_center: Command,
}

const SKILL_FALLBACK_COLORS: Record<string, string> = {
  web_research: '#4dabf7',
  tavily: '#4dabf7',
  code_execution: '#a78bfa',
  terminal: '#10b981',
  computer_use: '#10b981',
  command_center: '#22d3ee',
  chart_generation: '#f59e0b',
  reminders: '#38bdf8',
  artifacts: '#f8fafc',
}

const ASSET_EXTENSIONS = ['svg', 'png', 'webp', 'jpg', 'jpeg'] as const

function getPixelSize(size: SkillLogoSize | number): number {
  if (typeof size === 'number') {
    return size
  }

  return SIZE_MAP[size] ?? SIZE_MAP.md
}

export function SkillLogo({
  skill,
  size = 'md',
  showFallback = true,
  className,
  style,
}: SkillLogoProps): React.ReactElement | null {
  const [attemptIndex, setAttemptIndex] = useState(0)
  const pixelSize = getPixelSize(size)
  const normalizedSkill = skill.toLowerCase()
  const assetName = SKILL_ASSET_NAMES[normalizedSkill] ?? normalizedSkill
  const CustomLogo = SKILL_CUSTOM_LOGOS[normalizedSkill]

  React.useEffect(() => {
    setAttemptIndex(0)
  }, [assetName])

  if (CustomLogo) {
    return (
      <CustomLogo
        size={pixelSize}
        className={className}
        style={style}
      />
    )
  }

  const assetPath = useMemo(() => {
    const extension = ASSET_EXTENSIONS[attemptIndex]
    return extension ? `./skills/${assetName}.${extension}` : null
  }, [assetName, attemptIndex])

  if (assetPath) {
    return (
      <img
        src={assetPath}
        alt={`${assetName} logo`}
        onError={() => setAttemptIndex((current) => current + 1)}
        className={className}
        style={{
          width: `${pixelSize}px`,
          height: `${pixelSize}px`,
          objectFit: 'contain',
          ...style,
        }}
      />
    )
  }

  if (!showFallback) {
    return null
  }

  const FallbackIcon = SKILL_FALLBACK_ICONS[normalizedSkill] ?? Globe
  const color = SKILL_FALLBACK_COLORS[normalizedSkill] ?? '#b0b0b0'

  return <FallbackIcon size={pixelSize} color={color} />
}

export default SkillLogo
