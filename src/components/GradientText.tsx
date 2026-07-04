import './GradientText.css'
import { ReactNode } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { getResolvedTheme } from '../themes/themeRegistry'

interface GradientTextProps {
  children: ReactNode
  className?: string
  colors?: string[]
  showBorder?: boolean
  useThemeAccent?: boolean
}

export default function GradientText({
  children,
  className = '',
  colors = ['#40ffaa', '#4079ff', '#40ffaa', '#4079ff', '#40ffaa'],
  showBorder = false,
  useThemeAccent = false,
}: GradientTextProps) {
  const { settings } = useSettings()

  const systemPrefersDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  const theme = getResolvedTheme(settings.activeTheme, settings.theme, systemPrefersDark)
  const themeColors = theme.colors

  // If useThemeAccent is true, build colors from theme
  const gradientColors = useThemeAccent
    ? [
        themeColors.accent,
        themeColors.accentSecondary || themeColors.accent,
        themeColors.accent,
        themeColors.accentSecondary || themeColors.accent,
        themeColors.accent,
      ]
    : colors

  const gradientStyle = {
    backgroundImage: `linear-gradient(to right, ${gradientColors.join(', ')})`,
  }

  return (
    <div className={`animated-gradient-text ${className}`}>
      {showBorder && <div className="gradient-overlay" style={gradientStyle}></div>}
      <div className="text-content" style={gradientStyle}>
        {children}
      </div>
    </div>
  )
}
