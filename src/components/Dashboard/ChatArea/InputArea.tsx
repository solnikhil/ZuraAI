/**
 * InputArea - Component for chat input handling
 * Handles text input, file attachment triggers, and submit
 *
 * Requirements: 1.1
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { Send, Paperclip, Search, Brain, MessageCircle, Check, Image, X, Info, Zap, Clock, ChevronDown } from '../../icons'
import ModelSelector from '../ModelSelector/index'
import { useSettings } from '../../../contexts/SettingsContext'
import { processFiles, type AttachedFile } from './FileUploadHandler'
import { PastedContentChunk } from './PastedContentChunk'
import type { PastedContentChunk as PastedContentChunkType } from './types'

export interface InputAreaProps {
  input: string
  setInput: (value: string) => void
  onSend: () => void
  isLoading: boolean
  attachedFiles: AttachedFile[]
  onFilesChange: (files: AttachedFile[]) => void
  pastedChunks?: PastedContentChunkType[]
  onChunkEdit?: (chunk: PastedContentChunkType) => void
  onChunkDelete?: (id: string) => void
  onChunkCreate?: (content: string) => void
  onError?: (message: string) => void
}

/**
 * InputArea Component - Main chat input with file attachments and controls
 */
export function InputArea({
  input,
  setInput,
  onSend,
  isLoading,
  attachedFiles,
  onFilesChange,
  pastedChunks = [],
  onChunkEdit,
  onChunkDelete,
  onChunkCreate,
  onError
}: InputAreaProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  const [showSearchMenu, setShowSearchMenu] = useState(false)
  const [searchMenuPos, setSearchMenuPos] = useState({ top: 0, left: 0 })
  const [searchMenuOpenUpward, setSearchMenuOpenUpward] = useState(false)
  const searchButtonRef = useRef<HTMLDivElement>(null)
  const searchMenuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings, updateSettings } = useSettings()

  // Menu dimensions for smart positioning
  const MENU_HEIGHT = 220 // approximate menu height
  const MENU_WIDTH = 240

  const imageFiles = attachedFiles.filter(f => f.type === 'image')

  // Click outside handler for search menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showSearchMenu &&
        searchMenuRef.current &&
        !searchMenuRef.current.contains(event.target as Node) &&
        searchButtonRef.current &&
        !searchButtonRef.current.contains(event.target as Node)
      ) {
        setShowSearchMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSearchMenu])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newFiles = await processFiles(files, { onError })
    if (newFiles.length > 0) {
      onFilesChange([...attachedFiles, ...newFiles])
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const PASTE_THRESHOLD = 250 // chars - triggers chunk creation

  const handlePaste = async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items
    const files: File[] = []

    // Check for files first
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }

    if (files.length > 0) {
      event.preventDefault()
      const newFiles = await processFiles(files, { onError })
      if (newFiles.length > 0) {
        onFilesChange([...attachedFiles, ...newFiles])
      }
      return
    }

    // Check for long text paste
    const pastedText = event.clipboardData.getData('text')
    if (pastedText.length > PASTE_THRESHOLD && onChunkCreate) {
      event.preventDefault()
      onChunkCreate(pastedText)
    }
    // Otherwise, allow default paste behavior for short text
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const newFiles = await processFiles(files, { onError })
      if (newFiles.length > 0) {
        onFilesChange([...attachedFiles, ...newFiles])
      }
    }
  }

  const removeFile = (fileId: string) => {
    onFilesChange(attachedFiles.filter(f => f.id !== fileId))
  }

  // Search menu handlers with smart positioning
  const toggleSearchMenu = useCallback(() => {
    if (searchButtonRef.current) {
      const rect = searchButtonRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      // Calculate available space
      const spaceBelow = viewportHeight - rect.bottom
      const spaceAbove = rect.top

      // Check if menu would fit below with some margin
      const fitsBelow = spaceBelow > MENU_HEIGHT + 20

      // Determine if we should open upward
      const openUpward = !fitsBelow && spaceAbove > MENU_HEIGHT - 50

      setSearchMenuOpenUpward(openUpward)

      if (openUpward) {
        // Position menu above the button
        const menuTop = rect.top - MENU_HEIGHT + 8
        // Ensure menu stays within left edge
        const menuLeft = Math.max(8, Math.min(rect.left, viewportWidth - MENU_WIDTH - 8))

        setSearchMenuPos({
          top: menuTop,
          left: menuLeft
        })
      } else {
        // Position menu below the button
        const menuTop = rect.bottom + 8
        // Ensure menu stays within left edge
        const menuLeft = Math.max(8, Math.min(rect.left, viewportWidth - MENU_WIDTH - 8))

        setSearchMenuPos({
          top: menuTop,
          left: menuLeft
        })
      }
    }
    setShowSearchMenu(prev => !prev)
  }, [])

  const closeSearchMenu = useCallback(() => {
    setShowSearchMenu(false)
  }, [])

  const handleSearchModeSelect = useCallback((mode: 'none' | 'webSearch' | 'deepResearch') => {
    if (mode === 'none') {
      updateSettings({ webSearchEnabled: false, deepResearchEnabled: false })
    } else if (mode === 'webSearch') {
      updateSettings({ webSearchEnabled: true, deepResearchEnabled: false })
    } else if (mode === 'deepResearch') {
      updateSettings({ webSearchEnabled: true, deepResearchEnabled: true })
    }
    closeSearchMenu()
  }, [updateSettings, closeSearchMenu])

  return (
    <>
      <div
        className="input-bar-container"
        style={{
          borderRadius: '12px',
          padding: '0',
          transition: 'all 0.3s ease',
          minHeight: '110px',
          width: '100%'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{
          background: isDragging ? 'var(--theme-info-bg)' : 'var(--theme-surface)',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          height: '100%',
          width: '100%',
          transition: 'background 0.2s ease'
        }}>
          {/* Pasted Content Chunks - inside the container */}
          {pastedChunks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pastedChunks.map(chunk => (
                <PastedContentChunk
                  key={chunk.id}
                  id={chunk.id}
                  content={chunk.content}
                  charCount={chunk.charCount}
                  onEdit={() => onChunkEdit?.(chunk)}
                  onDelete={() => onChunkDelete?.(chunk.id)}
                />
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onPaste={handlePaste}
            placeholder={isDragging ? "Drop files here..." : "Ask a question..."}
            disabled={isLoading}
            rows={1}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#fff',
              resize: 'none',
              outline: 'none',
              fontSize: '0.95rem',
              fontWeight: 400,
              fontFamily: 'inherit',
              lineHeight: '1.6',
              minHeight: '32px',
              maxHeight: '200px'
            }}
          />

          {/* Bottom row - model selector and send */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Grouped pill container */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '2px',
              gap: '2px'
            }}>
              <ModelSelector minimal={true} />

              {/* Divider */}
              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

              {/* Search Mode Button */}
              <div
                ref={searchButtonRef}
                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
              >
                <button
                  onClick={toggleSearchMenu}
                  style={{
                    background: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info-bg)'
                      : settings.deepResearchEnabled ? 'var(--theme-accent-muted)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info)'
                      : settings.deepResearchEnabled ? 'var(--theme-accent)' : '#666',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    height: '100%'
                  }}
                >
                  <Search size={16} />
                </button>
              </div>

              {/* Search Menu Portal */}
              {showSearchMenu && ReactDOM.createPortal(
                <div
                  ref={searchMenuRef}
                  style={{
                    position: 'fixed',
                    top: `${searchMenuPos.top}px`,
                    left: `${searchMenuPos.left}px`,
                    background: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '12px',
                    padding: '8px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                    zIndex: 99999,
                    minWidth: '240px',
                    animation: 'fadeIn 0.15s ease-out'
                  }}
                >
                  {/* Arrow pointing towards button */}
                  {searchMenuOpenUpward ? (
                    // Arrow pointing down (menu is above button)
                    <div style={{
                      position: 'absolute',
                      bottom: '-6px',
                      left: '12px',
                      width: '10px',
                      height: '10px',
                      background: 'var(--theme-surface)',
                      transform: 'rotate(45deg)',
                      borderRight: '1px solid var(--theme-border)',
                      borderBottom: '1px solid var(--theme-border)'
                    }} />
                  ) : (
                    // Arrow pointing up (menu is below button)
                    <div style={{
                      position: 'absolute',
                      top: '-6px',
                      left: '12px',
                      width: '10px',
                      height: '10px',
                      background: 'var(--theme-surface)',
                      transform: 'rotate(45deg)',
                      borderLeft: '1px solid var(--theme-border)',
                      borderTop: '1px solid var(--theme-border)'
                    }} />
                  )}

                  {/* Menu Header */}
                  <div style={{
                    padding: '8px 12px 12px 12px',
                    borderBottom: '1px solid var(--theme-border)',
                    marginBottom: '4px'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--theme-text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Search Mode
                    </div>
                  </div>

                  {/* No Web Search */}
                  <button
                    onClick={() => handleSearchModeSelect('none')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: (!settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.15s',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.05)',
                      flexShrink: 0
                    }}>
                      <MessageCircle size={14} color="#888" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 500,
                        color: '#fff',
                        marginBottom: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        Off
                        {!settings.webSearchEnabled && !settings.deepResearchEnabled && (
                          <Check size={14} color="#60a5fa" />
                        )}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--theme-text-secondary)'
                      }}>
                        Standard AI response without web access
                      </div>
                    </div>
                  </button>

                  {/* Web Search */}
                  <button
                    onClick={() => handleSearchModeSelect('webSearch')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info-bg)' : 'transparent',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.15s',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: (settings.webSearchEnabled && !settings.deepResearchEnabled)
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(255,255,255,0.05)',
                      flexShrink: 0
                    }}>
                      <Zap size={14} color={settings.webSearchEnabled && !settings.deepResearchEnabled ? 'var(--theme-info)' : '#666'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 500,
                        color: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info)' : '#fff',
                        marginBottom: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        Quick Search
                        {settings.webSearchEnabled && !settings.deepResearchEnabled && (
                          <Check size={14} color="var(--theme-info)" />
                        )}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--theme-text-secondary)'
                      }}>
                        Fast web lookup for current information
                      </div>
                    </div>
                  </button>

                  {/* Deep Research */}
                  <button
                    onClick={() => handleSearchModeSelect('deepResearch')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: settings.deepResearchEnabled ? 'var(--theme-accent-muted)' : 'transparent',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.15s',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: settings.deepResearchEnabled
                        ? 'rgba(139, 92, 246, 0.15)'
                        : 'rgba(255,255,255,0.05)',
                      flexShrink: 0
                    }}>
                      <Brain size={14} color={settings.deepResearchEnabled ? 'var(--theme-accent)' : '#666'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 500,
                        color: settings.deepResearchEnabled ? 'var(--theme-accent)' : '#fff',
                        marginBottom: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        Deep Research
                        {settings.deepResearchEnabled && (
                          <Check size={14} color="var(--theme-accent)" />
                        )}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--theme-text-secondary)'
                      }}>
                        Comprehensive analysis with multiple sources
                      </div>
                    </div>
                  </button>
                </div>,
                document.body
              )}

              {/* Images button */}
              {imageFiles.length > 0 && (
                <>
                  <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
                  <button
                    onClick={() => setShowImageModal(true)}
                    title={`${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} attached`}
                    style={{
                      background: 'var(--theme-info-bg)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      color: 'var(--theme-info)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                      height: '100%',
                      position: 'relative'
                    }}
                  >
                    <Image size={16} />
                    {imageFiles.length > 1 && (
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: 'rgba(59, 130, 246, 0.3)',
                        borderRadius: '10px',
                        padding: '1px 4px',
                        minWidth: '16px',
                        textAlign: 'center'
                      }}>
                        {imageFiles.length}
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Right side buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                accept="image/*,.pdf,.txt,.doc,.docx,.csv,.json,.xml"
                style={{ display: 'none' }}
              />
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                type="button"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  width: '36px',
                  height: '36px',
                  color: attachedFiles.length > 0 ? 'var(--theme-accent)' : '#888',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0
                }}
                title={attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'Attach files'}
              >
                <Paperclip size={18} />
              </button>

              {/* Send button */}
              <button
                onClick={onSend}
                disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                style={{
                  background: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'var(--theme-accent)' : 'rgba(255, 255, 255, 0.03)',
                  border: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  width: '36px',
                  height: '36px',
                  color: (input.trim() || attachedFiles.length > 0) && !isLoading ? '#000' : '#888',
                  cursor: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  padding: 0,
                  opacity: isLoading ? 0.5 : 1
                }}
                title={attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'Send message'}
              >
                {isLoading ? (
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {showImageModal && imageFiles.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={() => setShowImageModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '90%',
              overflowY: 'auto',
              boxShadow: 'var(--theme-shadow-lg)',
              position: 'relative',
              color: 'var(--theme-text-secondary)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowImageModal(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'none',
                border: 'none',
                color: '#b0b0b0',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ marginTop: '0', marginBottom: '20px', color: '#fff', fontSize: '1.2rem' }}>
              Attached Images ({imageFiles.length})
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '16px',
              marginTop: '16px'
            }}>
              {imageFiles.map((file) => (
                <div
                  key={file.id}
                  style={{
                    position: 'relative',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)'
                  }}
                >
                  <img
                    src={file.data}
                    alt={file.name}
                    style={{
                      width: '100%',
                      height: '200px',
                      objectFit: 'contain',
                      background: 'var(--theme-background)',
                      display: 'block'
                    }}
                  />
                  <div style={{
                    padding: '8px',
                    borderTop: '1px solid var(--theme-border)'
                  }}>
                    <div style={{
                      fontSize: '0.85rem',
                      color: 'var(--theme-text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: '4px'
                    }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#b0b0b0' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      removeFile(file.id)
                      if (imageFiles.length === 1) {
                        setShowImageModal(false)
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'rgba(0,0,0,0.7)',
                      border: 'none',
                      color: '#f87171',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default InputArea
