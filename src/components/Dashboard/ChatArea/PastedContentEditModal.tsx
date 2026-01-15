/**
 * PastedContentEditModal - Modal overlay for editing pasted content
 * Full-screen overlay with textarea for editing long pasted text
 */

import React, { useState, useEffect, useRef } from 'react'
import { X, Check, Trash2 } from '../../icons'

export interface PastedContentEditModalProps {
  content: string
  onSave: (content: string) => void
  onCancel: () => void
  onDelete?: () => void
}

export function PastedContentEditModal({
  content,
  onSave,
  onCancel,
  onDelete
}: PastedContentEditModalProps) {
  const [editedContent, setEditedContent] = useState(content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount - use requestAnimationFrame to avoid blocking
  useEffect(() => {
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    })
  }, [])

  const formatCharCount = (count: number) => {
    return count.toLocaleString()
  }

  const handleSave = () => {
    if (editedContent.trim().length > 0) {
      onSave(editedContent.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to save
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSave()
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
        willChange: 'transform'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: '16px',
          width: '95%',
          maxWidth: '1000px',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          willChange: 'transform, opacity'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--theme-border)'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)'
            }}>
              Edit Pasted Content
            </h2>
            <div style={{
              fontSize: '0.85rem',
              color: 'var(--theme-text-secondary)',
              marginTop: '4px'
            }}>
              {formatCharCount(editedContent.length)} chars • Ctrl+Enter to save
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--theme-text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Textarea */}
        <div style={{
          flex: 1,
          padding: '20px 24px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <textarea
            ref={textareaRef}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--theme-border)',
              borderRadius: '10px',
              padding: '16px',
              color: 'var(--theme-text-primary)',
              fontSize: '1rem',
              fontFamily: 'inherit',
              lineHeight: '1.7',
              resize: 'none',
              outline: 'none'
            }}
            placeholder="Enter your content..."
          />
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderTop: '1px solid var(--theme-border)',
          gap: '16px'
        }}>
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                background: 'rgba(248, 113, 113, 0.1)',
                border: '1px solid rgba(248, 113, 113, 0.2)',
                borderRadius: '10px',
                padding: '10px 18px',
                color: '#f87171',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onCancel}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '10px 20px',
                color: 'var(--theme-text-secondary)',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 500
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!editedContent.trim()}
              style={{
                background: editedContent.trim() ? 'var(--theme-accent)' : 'rgba(255, 255, 255, 0.03)',
                border: editedContent.trim() ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '10px 20px',
                color: editedContent.trim() ? '#000' : 'var(--theme-text-secondary)',
                cursor: editedContent.trim() ? 'pointer' : 'default',
                fontSize: '0.95rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: editedContent.trim() ? 1 : 0.5
              }}
            >
              <Check size={16} />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PastedContentEditModal
