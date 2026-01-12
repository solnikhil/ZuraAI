/**
 * InputArea - Component for chat input handling
 * Handles text input, file attachment triggers, and submit
 * 
 * Requirements: 1.1
 */

import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Send, Paperclip, Globe, Brain, MessageCircle, Check, Image, X } from '../../icons'
import StarBorder from '../../StarBorder'
import ModelSelector from '../ModelSelector/index'
import { useSettings } from '../../../contexts/SettingsContext'
import { processFiles, type AttachedFile } from './FileUploadHandler'

export interface InputAreaProps {
  input: string
  setInput: (value: string) => void
  onSend: () => void
  isLoading: boolean
  attachedFiles: AttachedFile[]
  onFilesChange: (files: AttachedFile[]) => void
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
  onError
}: InputAreaProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  const [showSearchMenu, setShowSearchMenu] = useState(false)
  const [searchMenuPos, setSearchMenuPos] = useState({ top: 0, left: 0 })
  const searchButtonRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings, updateSettings } = useSettings()

  const imageFiles = attachedFiles.filter(f => f.type === 'image')

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

  const handlePaste = async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items
    const files: File[] = []

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
    }
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

  // Search menu handlers
  const handleSearchMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    if (searchButtonRef.current) {
      const rect = searchButtonRef.current.getBoundingClientRect()
      setSearchMenuPos({ top: rect.top - 8, left: rect.left })
    }
    setShowSearchMenu(true)
  }

  const handleSearchMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowSearchMenu(false)
    }, 200)
  }

  const handleMenuMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setShowSearchMenu(true)
  }

  const handleMenuMouseLeave = () => {
    setShowSearchMenu(false)
  }

  return (
    <>
      <StarBorder
        as="div"
        className="input-bar-container"
        color={isFocused || isDragging ? "cyan" : "#444"}
        speed="10s"
        style={{
          borderRadius: '24px',
          padding: '0',
          transition: 'all 0.3s ease',
          border: isDragging ? '2px dashed #60a5fa' : undefined,
          minHeight: '110px',
          width: '100%'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{
          background: isDragging ? 'var(--theme-info-bg)' : 'var(--theme-surface)',
          borderRadius: '22px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          height: '100%',
          width: '100%',
          transition: 'background 0.2s ease'
        }}>
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
                onMouseEnter={handleSearchMouseEnter}
                onMouseLeave={handleSearchMouseLeave}
                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
              >
                <button
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
                  <Globe size={16} />
                </button>
              </div>

              {/* Search Menu Portal */}
              {showSearchMenu && ReactDOM.createPortal(
                <div
                  onMouseEnter={handleMenuMouseEnter}
                  onMouseLeave={handleMenuMouseLeave}
                  style={{
                    position: 'fixed',
                    top: `${searchMenuPos.top}px`,
                    left: `${searchMenuPos.left}px`,
                    transform: 'translateY(-100%)',
                    marginTop: '-8px',
                    background: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '12px',
                    padding: '8px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                    zIndex: 99999,
                    minWidth: '160px'
                  }}
                >
                  {/* No Web Search */}
                  <button
                    onClick={() => updateSettings({ webSearchEnabled: false, deepResearchEnabled: false })}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: (!settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.15s'
                    }}
                  >
                    <MessageCircle size={16} color="#888" />
                    <span>No Web Search</span>
                    {!settings.webSearchEnabled && !settings.deepResearchEnabled && (
                      <Check size={14} color="#60a5fa" style={{ marginLeft: 'auto' }} />
                    )}
                  </button>

                  {/* Web Search */}
                  <button
                    onClick={() => updateSettings({ webSearchEnabled: true, deepResearchEnabled: false })}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info-bg)' : 'transparent',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.15s'
                    }}
                  >
                    <Globe size={16} color={settings.webSearchEnabled && !settings.deepResearchEnabled ? 'var(--theme-info)' : '#666'} />
                    <span>Web Search</span>
                    {settings.webSearchEnabled && !settings.deepResearchEnabled && (
                      <Check size={14} color="var(--theme-info)" style={{ marginLeft: 'auto' }} />
                    )}
                  </button>

                  {/* Deep Research */}
                  <button
                    onClick={() => updateSettings({ webSearchEnabled: true, deepResearchEnabled: true })}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: settings.deepResearchEnabled ? 'var(--theme-accent-muted)' : 'transparent',
                      color: '#ccc',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.15s'
                    }}
                  >
                    <Brain size={16} color={settings.deepResearchEnabled ? 'var(--theme-accent)' : '#666'} />
                    <span>Deep Research</span>
                    {settings.deepResearchEnabled && (
                      <Check size={14} color="var(--theme-accent)" style={{ marginLeft: 'auto' }} />
                    )}
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
                  background: attachedFiles.length > 0 ? 'var(--theme-accent)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: attachedFiles.length > 0 ? '#000' : '#cccccc',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'Attach files'}
              >
                <Paperclip size={18} />
              </button>

              {/* Send button */}
              {!isLoading && (
                <button
                  onClick={onSend}
                  disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                  style={{
                    background: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'var(--theme-accent)' : 'transparent',
                    border: '1px solid var(--theme-border)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: (input.trim() || attachedFiles.length > 0) && !isLoading ? '#000' : 'var(--theme-text-muted)',
                    cursor: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    transform: (input.trim() || attachedFiles.length > 0) && !isLoading ? 'scale(1)' : 'scale(0.95)'
                  }}
                  title={attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'Send message'}
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </StarBorder>

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
