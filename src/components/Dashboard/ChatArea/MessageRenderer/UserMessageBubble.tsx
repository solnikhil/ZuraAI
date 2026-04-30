import React from 'react'
import { File } from '@/components/icons'
import type { MessageRendererProps } from './types'
import type { FileAttachment } from '@/chat/types'
import { formatFileSize } from '../attachmentUtils'

const bubbleStyleByPreset: Record<
  'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal',
  React.CSSProperties
> = {
  solid: {
    background: 'var(--theme-user-message-bg)',
    border: '1px solid var(--theme-border-subtle)',
    boxShadow: 'var(--theme-shadow-sm)',
    color: 'var(--theme-user-message-text)',
  },
  glass: {
    background: 'rgba(148, 163, 184, 0.18)',
    border: '1px solid rgba(255, 255, 255, 0.22)',
    boxShadow: 'var(--theme-shadow-sm)',
    color: 'var(--theme-text-primary)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  outline: {
    background: 'transparent',
    border: '1px solid var(--theme-accent-muted)',
    boxShadow: 'none',
    color: 'var(--theme-text-primary)',
  },
  gradient: {
    background:
      'linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 82%, transparent) 0%, color-mix(in srgb, var(--theme-accent-secondary) 78%, transparent) 100%)',
    border: '1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent)',
    boxShadow: 'var(--theme-shadow-sm)',
    color: 'var(--theme-text-inverse)',
  },
  elevated: {
    background: 'var(--theme-surface)',
    border: '1px solid var(--theme-border)',
    boxShadow: 'var(--theme-shadow-md)',
    color: 'var(--theme-text-primary)',
  },
  terminal: {
    background: 'color-mix(in srgb, var(--theme-background) 76%, black 24%)',
    border: '1px dashed var(--theme-border-hover)',
    boxShadow: 'none',
    color: 'var(--theme-text-primary)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.01em',
  },
}

/**
 * User Message Bubble
 */
export function UserMessageBubble({
  message,
  bubbleStyle = 'solid',
}: {
  message: MessageRendererProps['message']
  bubbleStyle?: 'solid' | 'glass' | 'outline' | 'gradient' | 'elevated' | 'terminal'
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        marginBottom: '24px',
        gap: '8px',
      }}
    >
      {message.files && message.files.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, max-content))',
            gap: '8px',
            maxWidth: '70%',
            width: 'fit-content',
            minWidth: 0,
            alignSelf: 'flex-end',
            justifyContent: 'end',
            justifyItems: 'end',
          }}
        >
          {message.files.map((file: FileAttachment) =>
            file.type === 'image' ? (
              <div
                key={file.id}
                style={{
                  background: 'color-mix(in srgb, var(--theme-surface) 88%, transparent)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '16px',
                  padding: '8px',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  boxShadow: 'var(--theme-shadow-sm)',
                }}
              >
                <img
                  src={file.data}
                  alt={file.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '12px',
                    objectFit: 'cover',
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    background:
                      'color-mix(in srgb, var(--theme-background) 84%, black 16%)',
                  }}
                />
              </div>
            ) : (
              <div
                key={file.id}
                style={{
                  background: 'color-mix(in srgb, var(--theme-surface) 88%, transparent)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '14px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  maxWidth: '100%',
                  boxShadow: 'var(--theme-shadow-sm)',
                }}
              >
                <File size={16} color="var(--theme-text-muted)" />
                <span
                  style={{
                    color: 'var(--theme-text-primary)',
                    fontSize: '0.85rem',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </span>
                <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.75rem' }}>
                  {formatFileSize(file.size)}
                </span>
              </div>
            )
          )}
        </div>
      )}

      {message.content && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '20px 20px 6px 20px',
            fontSize: '0.95rem',
            maxWidth: '70%',
            whiteSpace: 'pre-wrap',
            ...bubbleStyleByPreset[bubbleStyle],
          }}
        >
          {message.content}
        </div>
      )}
    </div>
  )
}

/**
 * Renders image file attachments in a grid (used for assistant messages).
 */
export function RenderImageFiles({ files }: { files: FileAttachment[] }) {
  const imageFiles = files.filter((file) => file.type === 'image')
  if (imageFiles.length === 0) return null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, max-content))',
        gap: '8px',
        maxWidth: '70%',
        width: '100%',
        marginBottom: '12px',
      }}
    >
      {imageFiles.map((file) => (
        <div
          key={file.id}
          style={{
            background: 'color-mix(in srgb, var(--theme-surface) 88%, transparent)',
            border: '1px solid var(--theme-border)',
            borderRadius: '16px',
            padding: '8px',
            maxWidth: '100%',
            overflow: 'hidden',
            boxShadow: 'var(--theme-shadow-sm)',
          }}
        >
          <img
            src={file.data}
            alt={file.name}
            style={{
              maxWidth: '100%',
              maxHeight: '300px',
              borderRadius: '12px',
              objectFit: 'cover',
              display: 'block',
              width: '100%',
              height: 'auto',
              background: 'color-mix(in srgb, var(--theme-background) 84%, black 16%)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
