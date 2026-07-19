import React, { useState } from 'react'
import { Bell, FileText, Globe, Terminal } from 'lucide-react'

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

interface SkillGlyphProps extends CustomSkillLogoProps {
  children: React.ReactNode
}

function SkillGlyph({ size, className, style, children }: SkillGlyphProps): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

function WebResearchLogo(props: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph {...props}>
      <circle cx="10.25" cy="10.25" r="5.75" />
      <path d="m14.5 14.5 5.25 5.25" />
      <path d="m8.15 12.35 1.3-4 4-1.3-1.3 4Z" strokeOpacity="0.5" />
    </SkillGlyph>
  )
}

function CodeExecutionLogo({ size, className, style }: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph size={size} className={className} style={style}>
      <path d="M8.75 6.75 3.5 12l5.25 5.25M15.25 6.75 20.5 12l-5.25 5.25" />
      <path d="m13.75 4.75-3.5 14.5" strokeOpacity="0.5" />
    </SkillGlyph>
  )
}

function TerminalLogo(props: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph {...props}>
      <path d="m5 7.25 4.75 4.75L5 16.75" />
      <path d="M11.75 16.75H19" strokeOpacity="0.5" />
    </SkillGlyph>
  )
}

function ComputerUseLogo(props: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph {...props}>
      <path d="M4.25 5.25h15.5v10.5H13.5M8.75 18.75h6.5" strokeOpacity="0.5" />
      <path d="m8 8.25 1.15 8.1 2.1-2.05 1.65 3.45 2.1-1-1.7-3.35 2.9-.3Z" />
    </SkillGlyph>
  )
}

function ChartGenerationLogo(props: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph {...props}>
      <path d="M5 19V14h3v5M10.5 19V10h3v9M16 19V6h3v13" />
      <path d="m5 10.25 4-3.5 3.5 1.5L19 3.75" strokeOpacity="0.5" />
    </SkillGlyph>
  )
}

function MemoryLogo(props: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph {...props}>
      <ellipse cx="12" cy="6.25" rx="6.75" ry="2.75" />
      <path d="M5.25 6.25v5.5c0 1.5 3.02 2.75 6.75 2.75s6.75-1.25 6.75-2.75v-5.5" />
      <path
        d="M5.25 11.75v5.5C5.25 18.75 8.27 20 12 20s6.75-1.25 6.75-2.75v-5.5"
        strokeOpacity="0.5"
      />
    </SkillGlyph>
  )
}

function RemindersLogo(props: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph {...props}>
      <path d="M6.25 16.75h11.5l-1.5-2.25V10a4.25 4.25 0 0 0-8.5 0v4.5Z" />
      <path d="M10 19a2.25 2.25 0 0 0 4 0M12 3.25v-1" strokeOpacity="0.5" />
    </SkillGlyph>
  )
}

function ArtifactsLogo(props: CustomSkillLogoProps): React.ReactElement {
  return (
    <SkillGlyph {...props}>
      <path d="M6 3.75h7.25L18 8.5v11.75H6Z" />
      <path d="M13.25 3.75V8.5H18M9 12h6M9 15.25h6" strokeOpacity="0.5" />
    </SkillGlyph>
  )
}

const SKILL_CUSTOM_LOGOS: Record<string, React.ComponentType<CustomSkillLogoProps>> = {
  web_research: WebResearchLogo,
  tavily: WebResearchLogo,
  code_execution: CodeExecutionLogo,
  terminal: TerminalLogo,
  computer_use: ComputerUseLogo,
  chart_generation: ChartGenerationLogo,
  memory: MemoryLogo,
  reminders: RemindersLogo,
  artifacts: ArtifactsLogo,
}

const SKILL_FALLBACK_ICONS: Record<
  string,
  React.ComponentType<{ size?: number | string; color?: string }>
> = {
  reminders: Bell,
  terminal: Terminal,
  artifacts: FileText,
}

const SKILL_FALLBACK_COLORS: Record<string, string> = {
  web_research: '#4dabf7',
  tavily: '#4dabf7',
  code_execution: '#a78bfa',
  terminal: '#10b981',
  computer_use: '#10b981',
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
    return <CustomLogo size={pixelSize} className={className} style={style} />
  }

  const extension = ASSET_EXTENSIONS[attemptIndex]
  const assetPath = extension ? `./skills/${assetName}.${extension}` : null

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
