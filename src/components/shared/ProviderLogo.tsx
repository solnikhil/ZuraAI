/**
 * Shared ProviderLogo component for ZuraAI
 * Consolidates duplicate ProviderLogo implementations from Settings.tsx and ModelSelector.tsx
 *
 */

import React, { useState } from 'react'
import { Cloud, Database, Sparkles, Zap, Brain } from 'lucide-react'
import { getLogoVisibleProviderIds, getProviderAccentColor, type ProviderId } from '../../providers'

/**
 * Provider types supported by the application
 */
export type ProviderType = ProviderId | 'gemini' | 'minimax'

/**
 * Size variants for the provider logo
 */
export type ProviderLogoSize = 'sm' | 'md' | 'lg'

/**
 * Props for the ProviderLogo component
 */
export interface ProviderLogoProps {
  /** Provider identifier */
  provider: ProviderType | string
  /** Size variant (sm: 14px, md: 20px, lg: 28px) or custom pixel size */
  size?: ProviderLogoSize | number
  /** Whether to show fallback icon when image fails to load */
  showFallback?: boolean
  /** Additional CSS class name */
  className?: string
  /** Additional inline styles */
  style?: React.CSSProperties
}

/**
 * Size mapping for predefined size variants
 */
const SIZE_MAP: Record<ProviderLogoSize, number> = {
  sm: 14,
  md: 20,
  lg: 28,
}

/**
 * Provider fallback icons
 */
const PROVIDER_FALLBACK_ICONS: Record<
  string,
  React.ComponentType<{ size?: number | string; color?: string }>
> = {
  gemini: Sparkles,
  openrouter: Cloud,
  groq: Zap,
  ollama: Database,
  minimax: Brain,
  alibaba: Cloud,
  codex: Sparkles,
  deepseek: Brain,
  fireworks: Sparkles,
  nvidia: Zap,
  opencode: Sparkles,
}

const PROVIDER_COLORS: Record<string, string> = {
  gemini: '#4dabf7',
  minimax: '#6366f1',
  nvidia: '#76b900',
  codex: '#10A37F',
  opencode: '#F1ECEC',
}

const PROVIDER_LOGO_EXTENSIONS: Record<string, 'png' | 'svg'> = {
  deepseek: 'svg',
  fireworks: 'svg',
  opencode: 'svg',
  codex: 'svg',
}

const PROVIDER_LOGO_ADJUSTMENTS: Record<
  string,
  { scale?: number; translateX?: number; translateY?: number }
> = {
  openrouter: { scale: 1.12, translateX: -0.5 },
  groq: { scale: 1.22 },
  fireworks: { scale: 0.94, translateY: 0.25 },
  nvidia: { scale: 1.04 },
  alibaba: { scale: 1.08 },
  deepseek: { scale: 0.92 },
  ollama: { scale: 1.04, translateY: 0.25 },
  // Official mark includes a square canvas; slightly larger so it matches peer logos.
  opencode: { scale: 1.08 },
  codex: { scale: 1.06 },
}

/**
 * Get the pixel size from size prop
 */
function getPixelSize(size: ProviderLogoSize | number): number {
  if (typeof size === 'number') {
    return size
  }
  return SIZE_MAP[size] || SIZE_MAP.sm
}

/**
 * ProviderLogo component
 * Renders provider logo with fallback icon support
 *
 * @example
 * // Basic usage
 * <ProviderLogo provider="gemini" />
 *
 * @example
 * // With size variant
 * <ProviderLogo provider="openrouter" size="lg" />
 *
 * @example
 * // With custom pixel size
 * <ProviderLogo provider="ollama" size={24} />
 *
 * @example
 * // With fallback disabled
 * <ProviderLogo provider="groq" showFallback={false} />
 */
export function ProviderLogo({
  provider,
  size = 'sm',
  showFallback = true,
  className,
  style,
}: ProviderLogoProps): React.ReactElement | null {
  const [imgError, setImgError] = useState(false)

  const pixelSize = getPixelSize(size)
  const normalizedProvider = provider.toLowerCase()
  const adjustment = PROVIDER_LOGO_ADJUSTMENTS[normalizedProvider] || {}
  const logoTransform = [
    `translate(${adjustment.translateX ?? 0}px, ${adjustment.translateY ?? 0}px)`,
    `scale(${adjustment.scale ?? 1})`,
  ].join(' ')

  // Try to render the image first
  if (!imgError) {
    const extension = PROVIDER_LOGO_EXTENSIONS[normalizedProvider] || 'png'
    return (
      <span
        className={className}
        style={{
          width: `${pixelSize}px`,
          height: `${pixelSize}px`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          ...style,
        }}
      >
        <img
          src={`./provider-logos/${normalizedProvider}.${extension}`}
          alt={`${provider} logo`}
          width={pixelSize}
          height={pixelSize}
          onError={() => setImgError(true)}
          style={{
            width: `${pixelSize}px`,
            height: `${pixelSize}px`,
            objectFit: 'contain',
            transform: logoTransform,
            transformOrigin: 'center',
            display: 'block',
          }}
        />
      </span>
    )
  }

  if (showFallback) {
    const FallbackIcon = PROVIDER_FALLBACK_ICONS[normalizedProvider]
    const color = PROVIDER_COLORS[normalizedProvider] || '#b0b0b0'

    if (FallbackIcon) {
      return (
        <span
          className={className}
          style={{
            width: `${pixelSize}px`,
            height: `${pixelSize}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            ...style,
          }}
        >
          <FallbackIcon size={pixelSize} color={color} />
        </span>
      )
    }
  }

  return null
}

/**
 * Get provider color by provider name
 *
 * @param provider - Provider identifier
 * @returns Hex color string
 */
export function getProviderLogoColor(provider: string): string {
  const normalizedProvider = provider.toLowerCase()
  if (normalizedProvider in PROVIDER_COLORS) {
    return PROVIDER_COLORS[normalizedProvider] || '#b0b0b0'
  }
  return getProviderAccentColor(normalizedProvider) || '#b0b0b0'
}

/**
 * Check if a provider has a logo available
 *
 * @param provider - Provider identifier
 * @returns True if provider is known
 */
export function isKnownProvider(provider: string): provider is ProviderType {
  const normalizedProvider = provider.toLowerCase()
  return (
    normalizedProvider === 'gemini' ||
    normalizedProvider === 'minimax' ||
    getLogoVisibleProviderIds().includes(normalizedProvider as ProviderId)
  )
}

export default ProviderLogo
