/**
 * PastedContentChunk - Compact "PASTED" label box inside input container
 * Shows as a minimal rectangular box with edit on hover
 */

import React, { useState } from 'react'
import { X, Edit2 } from '../../icons'
import type { PastedContentChunk } from './types'

export interface PastedContentChunkProps {
  id: string
  content: string
  charCount: number
  onEdit: () => void
  onDelete: () => void
}

export function PastedContentChunk({
  id,
  content,
  charCount,
  onEdit,
  onDelete
}: PastedContentChunkProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Get preview
  const preview = content.slice(0, 60) + (content.length > 60 ? '...' : '')

  return (
    <div
      style={{
        position: 'relative',
        marginBottom: '6px',
        width: 'fit-content'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Pasted content box */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '6px',
        padding: '8px 10px',
        width: '120px',
        height: '60px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'border-color 0.2s'
      }}>
        {/* Content preview */}
        <div style={{
          fontSize: '0.7rem',
          color: 'rgba(255, 255, 255, 0.5)',
          lineHeight: '1.3',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {preview}
        </div>

        {/* PASTED label - always visible at bottom */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '4px'
        }}>
          <span style={{
            fontSize: '0.55rem',
            fontWeight: 700,
            letterSpacing: '0.8px',
            color: 'rgba(255, 255, 255, 0.4)',
            textTransform: 'uppercase'
          }}>
            Pasted
          </span>

          {/* Action buttons on hover */}
          <div style={{
            display: 'flex',
            gap: '4px',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.2s'
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                borderRadius: '3px',
                padding: '2px 4px',
                color: 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
              }}
            >
              <Edit2 size={9} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              style={{
                background: 'rgba(248, 113, 113, 0.1)',
                border: 'none',
                borderRadius: '3px',
                padding: '2px 4px',
                color: 'rgba(248, 113, 113, 0.8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'
              }}
            >
              <X size={9} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PastedContentChunk
