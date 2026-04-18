import React, { useMemo, useState } from 'react'
import { Globe } from 'lucide-react'

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

function WebResearchLogo({ size, className, style }: CustomSkillLogoProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'block',
        ...style,
      }}
    >
      <path
        d="M8 5.75H6.9C5.85 5.75 5 6.6 5 7.65V8.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 5.75H17.1C18.15 5.75 19 6.6 19 7.65V8.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 18.25H6.9C5.85 18.25 5 17.4 5 16.35V15.25"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 18.25H17.1C18.15 18.25 19 17.4 19 16.35V15.25"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="11"
        cy="11"
        r="3.3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M13.45 13.45L18 18"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle
        cx="11"
        cy="11"
        r="0.95"
        fill="currentColor"
      />
    </svg>
  )
}

function CodeExecutionLogo({ size, className, style }: CustomSkillLogoProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'block',
        ...style,
      }}
    >
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 8l3 3-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

const SKILL_CUSTOM_LOGOS: Record<string, React.ComponentType<CustomSkillLogoProps>> = {
  web_research: WebResearchLogo,
  tavily: WebResearchLogo,
  code_execution: CodeExecutionLogo,
}

const SKILL_FALLBACK_ICONS: Record<string, React.ComponentType<{ size?: number | string; color?: string }>> = {
}

const SKILL_FALLBACK_COLORS: Record<string, string> = {
  web_research: '#4dabf7',
  tavily: '#4dabf7',
  code_execution: '#a78bfa',
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
