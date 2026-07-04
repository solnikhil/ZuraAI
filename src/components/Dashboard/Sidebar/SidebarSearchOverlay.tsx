import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Search, X } from '../../icons'
import type { ChatSession } from '../../../chat/types'
import { filterSessions, getMatchSnippet } from './utils/filterSessions'

interface SidebarSearchOverlayProps {
  isOpen: boolean
  query: string
  sessions: ChatSession[]
  currentSessionId: string | null
  onQueryChange: (query: string) => void
  onSelectSession: (id: string) => void
  onClose: () => void
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function getTimeLabel(updatedAt: number): string {
  const now = new Date()
  const todayStart = startOfDay(now)

  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const sevenDaysAgoStart = new Date(todayStart)
  sevenDaysAgoStart.setDate(sevenDaysAgoStart.getDate() - 7)

  const thirtyDaysAgoStart = new Date(todayStart)
  thirtyDaysAgoStart.setDate(thirtyDaysAgoStart.getDate() - 30)

  if (updatedAt >= todayStart.getTime()) return 'Today'
  if (updatedAt >= yesterdayStart.getTime()) return 'Yesterday'
  if (updatedAt >= sevenDaysAgoStart.getTime()) return 'Past week'
  if (updatedAt >= thirtyDaysAgoStart.getTime()) return 'Past month'

  return new Date(updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })
}

export default function SidebarSearchOverlay({
  isOpen,
  query,
  sessions,
  currentSessionId,
  onQueryChange,
  onSelectSession,
  onClose,
}: SidebarSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const results = useMemo(() => {
    return filterSessions(sessions, query).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessions, query])

  useEffect(() => {
    if (!isOpen) return

    setHighlightedIndex(0)
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (results.length === 0) {
      setHighlightedIndex(0)
      return
    }

    setHighlightedIndex((prev) => Math.max(0, Math.min(prev, results.length - 1)))
  }, [results.length])

  const handleSelectSession = (id: string) => {
    onSelectSession(id)
    onClose()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }

    if (results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.min(prev + 1, results.length - 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => Math.max(prev - 1, 0))
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const selected = results[highlightedIndex] || results[0]
      if (selected) {
        handleSelectSession(selected.id)
      }
    }
  }

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.46)',
        backdropFilter: 'blur(2px)',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search chats"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 100%)',
          height: 'min(74vh, 640px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          border: '1px solid #3e3e3e',
          background: 'linear-gradient(180deg, #2e2e2e 0%, #262626 100%)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: '34px',
              borderRadius: '9px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: '#2a2a2a',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 10px',
            }}
          >
            <Search size={15} style={{ color: 'rgba(255, 255, 255, 0.62)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search chats and projects"
              data-sidebar-search
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.92)',
                fontSize: '0.94rem',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQueryChange('')}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.48)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                cursor: 'pointer',
                flexShrink: 0,
                opacity: query.trim() === '' ? 0.38 : 1,
              }}
            >
              <X size={14} />
            </button>
          </div>

          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.58)',
              width: '28px',
              height: '28px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 0',
          }}
        >
          {results.length === 0 && (
            <div
              style={{
                margin: 'auto',
                color: 'rgba(255, 255, 255, 0.56)',
                fontSize: '0.92rem',
                textAlign: 'center',
                padding: '24px',
              }}
            >
              No chats found
            </div>
          )}

          {results.map((session, index) => {
            const isHighlighted = index === highlightedIndex
            const isCurrentSession = currentSessionId === session.id
            const snippet = query.trim() ? getMatchSnippet(session, query) : null

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => handleSelectSession(session.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  border: 'none',
                  background: isHighlighted ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: 'inherit',
                  width: '100%',
                  minHeight: snippet ? '54px' : '42px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: snippet ? '6px 16px' : '0 16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <MessageCircle
                    size={14}
                    style={{
                      color: isCurrentSession
                        ? 'rgba(255, 255, 255, 0.92)'
                        : 'rgba(255, 255, 255, 0.66)',
                      flexShrink: 0,
                      marginTop: '3px',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <span
                      style={{
                        color: isCurrentSession
                          ? 'rgba(255, 255, 255, 0.95)'
                          : 'rgba(255, 255, 255, 0.86)',
                        fontSize: '1.02rem',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {session.title}
                    </span>
                    {snippet && (
                      <span
                        style={{
                          color: 'rgba(255, 255, 255, 0.44)',
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3,
                        }}
                      >
                        <span
                          style={{
                            color: 'rgba(255, 255, 255, 0.56)',
                            fontWeight: 500,
                          }}
                        >
                          {snippet.role}:
                        </span>{' '}
                        {snippet.snippet}
                      </span>
                    )}
                  </div>
                </div>

                <span
                  style={{
                    color: 'rgba(255, 255, 255, 0.46)',
                    fontSize: '0.95rem',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    alignSelf: 'flex-start',
                    marginTop: '2px',
                  }}
                >
                  {getTimeLabel(session.updatedAt)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
