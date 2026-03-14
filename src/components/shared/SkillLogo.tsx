import React, { useMemo, useState } from 'react'
import { FlaskConical, Globe, Radar } from 'lucide-react'

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
  testing: 'testing',
}

const SKILL_FALLBACK_ICONS: Record<string, React.ComponentType<{ size?: number | string; color?: string }>> = {
  web_research: Radar,
  tavily: Radar,
  testing: FlaskConical,
}

const SKILL_FALLBACK_COLORS: Record<string, string> = {
  web_research: '#4dabf7',
  tavily: '#4dabf7',
  testing: '#f59f00',
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

  React.useEffect(() => {
    setAttemptIndex(0)
  }, [assetName])

  const assetPath = useMemo(() => {
    const extension = ASSET_EXTENSIONS[attemptIndex]
    return extension ? `/skills/${assetName}.${extension}` : null
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
