/**
 * Unit tests for ProviderLogo component
 * Tests MiniMax provider logo rendering and fallback behavior
 *
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProviderLogo, isKnownProvider, getProviderLogoColor } from './ProviderLogo'

describe('ProviderLogo', () => {
  describe('MiniMax provider support', () => {
    it('should recognize minimax as a known provider', () => {
      expect(isKnownProvider('minimax')).toBe(true)
      expect(isKnownProvider('MiniMax')).toBe(true)
      expect(isKnownProvider('MINIMAX')).toBe(true)
    })

    it('should return correct color for minimax provider', () => {
      const color = getProviderLogoColor('minimax')
      expect(color).toBe('#6366f1')
    })

    it('should render minimax logo image initially', () => {
      render(<ProviderLogo provider="minimax" />)
      const img = screen.getByAltText('minimax logo')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', '/provider-logos/minimax.png')
    })

    it('should render fallback icon when minimax image fails to load', () => {
      render(<ProviderLogo provider="minimax" />)
      const img = screen.getByAltText('minimax logo')

      // Simulate image load error
      fireEvent.error(img)

      // After error, the fallback icon should be rendered (Brain icon from lucide)
      // The img should no longer be in the document
      expect(screen.queryByAltText('minimax logo')).not.toBeInTheDocument()
    })

    it('should handle case-insensitive provider names', () => {
      render(<ProviderLogo provider="MiniMax" />)
      const img = screen.getByAltText('MiniMax logo')
      expect(img).toHaveAttribute('src', '/provider-logos/minimax.png')
    })
  })

  describe('size variants', () => {
    it('should apply small size by default', () => {
      render(<ProviderLogo provider="minimax" />)
      const img = screen.getByAltText('minimax logo')
      expect(img).toHaveStyle({ width: '14px', height: '14px' })
    })

    it('should apply medium size', () => {
      render(<ProviderLogo provider="minimax" size="md" />)
      const img = screen.getByAltText('minimax logo')
      expect(img).toHaveStyle({ width: '20px', height: '20px' })
    })

    it('should apply large size', () => {
      render(<ProviderLogo provider="minimax" size="lg" />)
      const img = screen.getByAltText('minimax logo')
      expect(img).toHaveStyle({ width: '28px', height: '28px' })
    })

    it('should apply custom pixel size', () => {
      render(<ProviderLogo provider="minimax" size={32} />)
      const img = screen.getByAltText('minimax logo')
      expect(img).toHaveStyle({ width: '32px', height: '32px' })
    })
  })

  describe('fallback behavior', () => {
    it('should not render fallback when showFallback is false', () => {
      const { container } = render(<ProviderLogo provider="minimax" showFallback={false} />)
      const img = screen.getByAltText('minimax logo')

      // Simulate image load error
      fireEvent.error(img)

      // With showFallback=false, nothing should be rendered after error
      expect(container.firstChild).toBeNull()
    })
  })

  describe('all providers', () => {
    const providers = ['ollama', 'perplexity', 'openrouter', 'gemini', 'groq', 'minimax']

    it.each(providers)('should recognize %s as a known provider', (provider) => {
      expect(isKnownProvider(provider)).toBe(true)
    })

    it.each(providers)('should render logo for %s provider', (provider) => {
      render(<ProviderLogo provider={provider} />)
      const img = screen.getByAltText(`${provider} logo`)
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', `/provider-logos/${provider}.png`)
    })
  })
})
