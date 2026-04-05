/**
 * ModelIcon component - renders model icon with provider logo fallback
 *
 */

import React, { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { ModelWithProvider } from './types'

/**
 * Props for ModelIcon component
 */
export interface ModelIconProps {
  /** Model to display icon for */
  model: ModelWithProvider
  /** Icon to use as fallback */
  icon: React.ReactNode
  /** Color for the fallback icon */
  color: string
  /** Size in pixels */
  size?: number
}

/**
 * ModelIcon component
 * Renders provider logo with fallback to icon
 */
export function ModelIcon({ model, icon, color, size = 24 }: ModelIconProps): React.ReactElement {
  const [imgError, setImgError] = useState(false)

  if (!imgError) {
    return (
      <img
        src={`./provider-logos/${model.provider}.png`}
        alt={model.displayName}
        onError={() => setImgError(true)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: 'contain',
          borderRadius: '6px',
        }}
      />
    )
  }

  // Scale padding and icon size proportionally based on the size prop
  const scaledPadding = Math.round(size * 0.4)
  const scaledIconSize = Math.round(size * 0.8)

  return (
    <div
      style={{
        padding: `${scaledPadding}px`,
        borderRadius: `${Math.round(size * 0.4)}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(145deg, ${color}22, transparent)`,
        color: color,
      }}
    >
      {React.isValidElement(icon) ? (
        React.cloneElement(icon as React.ReactElement<{ size?: number }>, {
          size: scaledIconSize,
        })
      ) : (
        <MessageSquare size={scaledIconSize} />
      )}
    </div>
  )
}

export default ModelIcon
