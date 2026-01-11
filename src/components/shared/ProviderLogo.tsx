/**
 * Shared ProviderLogo component for Zura AI
 * Consolidates duplicate ProviderLogo implementations from Settings.tsx and ModelSelector.tsx
 * 
 * @module ProviderLogo
 * Requirements: 4.4
 */

import React, { useState } from 'react'
import { Cloud, Database, Globe, Sparkles, Zap } from 'lucide-react'

/**
 * Provider types supported by the application
 */
export type ProviderType = 'ollama' | 'perplexity' | 'openrouter' | 'gemini' | 'groq'

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
  lg: 28
}

/**
 * Provider fallback icons
 */
const PROVIDER_FALLBACK_ICONS: Record<string, React.ComponentType<{ size?: number | string }>> = {
  gemini: Sparkles,
  openrouter: Cloud,
  perplexity: Globe,
  groq: Zap,
  ollama: Database
}

/**
 * Provider colors for fallback icons
 */
const PROVIDER_COLORS: Record<string, string> = {
  gemini: '#4dabf7',
  openrouter: '#a855f7',
  perplexity: '#22c55e',
  groq: '#f97316',
  ollama: '#339af0'
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
  style
}: ProviderLogoProps): React.ReactElement | null {
  const [imgError, setImgError] = useState(false)
  
  const pixelSize = getPixelSize(size)
  const normalizedProvider = provider.toLowerCase()
  
  // Try to render the image first
  if (!imgError) {
    return (
      <img
        src={`/provider-logos/${normalizedProvider}.png`}
        alt={`${provider} logo`}
        onError={() => setImgError(true)}
        className={className}
        style={{
          width: `${pixelSize}px`,
          height: `${pixelSize}px`,
          objectFit: 'contain',
          ...style
        }}
      />
    )
  }
  
  // Render fallback icon if enabled and available
  if (showFallback) {
    const FallbackIcon = PROVIDER_FALLBACK_ICONS[normalizedProvider]
    const color = PROVIDER_COLORS[normalizedProvider] || '#b0b0b0'
    
    if (FallbackIcon) {
      return (
        <FallbackIcon 
          size={pixelSize} 
          // @ts-ignore - color prop is valid for lucide icons
          color={color}
        />
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
  return PROVIDER_COLORS[provider.toLowerCase()] || '#b0b0b0'
}

/**
 * Check if a provider has a logo available
 * 
 * @param provider - Provider identifier
 * @returns True if provider is known
 */
export function isKnownProvider(provider: string): provider is ProviderType {
  return ['ollama', 'perplexity', 'openrouter', 'gemini', 'groq'].includes(provider.toLowerCase())
}

export default ProviderLogo
