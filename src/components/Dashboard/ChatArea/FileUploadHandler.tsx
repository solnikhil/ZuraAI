/**
 * FileUploadHandler - Component for handling file attachments in chat
 * Handles file selection, validation, preview, and removal
 * 
 * Requirements: 1.2
 */

import React, { useRef } from 'react'
import { X, Image, File, FileText } from '../../icons'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface AttachedFile {
  id: string
  name: string
  type: string
  size: number
  data: string
  mimeType: string
}

export interface FileUploadHandlerProps {
  attachedFiles: AttachedFile[]
  onFilesChange: (files: AttachedFile[]) => void
  maxFiles?: number
  maxSizeBytes?: number
  acceptedTypes?: string[]
  onError?: (message: string) => void
}

/**
 * Process files and convert to AttachedFile format
 */
export async function processFiles(
  files: FileList | File[],
  options?: {
    maxSizeBytes?: number
    onError?: (message: string) => void
  }
): Promise<AttachedFile[]> {
  const fileArray = Array.from(files)
  const newFiles: AttachedFile[] = []
  const maxSize = options?.maxSizeBytes || 20 * 1024 * 1024 // 20MB default

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i]

    // Check file size
    if (file.size > maxSize) {
      options?.onError?.(`File "${file.name}" is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`)
      continue
    }

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      newFiles.push({
        id: `${Date.now()}-${i}`,
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        size: file.size,
        data: base64Data,
        mimeType: file.type
      })
    } catch (error) {
      console.error('Error reading file:', error)
      options?.onError?.(`Error reading file "${file.name}"`)
    }
  }

  return newFiles
}

/**
 * Image Preview Modal
 */
function ImagePreviewModal({ 
  imageFiles, 
  onClose, 
  onRemove 
}: { 
  imageFiles: AttachedFile[]
  onClose: () => void
  onRemove: (fileId: string) => void
}) {
  return (
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
      onClick={onClose}
    >
      <ScrollArea
        style={{
          backgroundColor: 'var(--theme-surface)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90%',
          boxShadow: 'var(--theme-shadow-lg)',
          position: 'relative',
          color: 'var(--theme-text-secondary)'
        }}
        viewportStyle={{ padding: '24px' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
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
            justifyContent: 'center',
            transition: 'all 0.2s'
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
                <div style={{
                  fontSize: '0.75rem',
                  color: '#b0b0b0'
                }}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                onClick={() => {
                  onRemove(file.id)
                  if (imageFiles.length === 1) {
                    onClose()
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
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * File Upload Handler Component
 */
export function FileUploadHandler({
  attachedFiles,
  onFilesChange,
  maxFiles = 10,
  maxSizeBytes = 20 * 1024 * 1024,
  acceptedTypes = ['image/*', '.txt', '.doc', '.docx', '.csv', '.json', '.xml'],
  onError
}: FileUploadHandlerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImageModal, setShowImageModal] = React.useState(false)

  const imageFiles = attachedFiles.filter(f => f.type === 'image')

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newFiles = await processFiles(files, { maxSizeBytes, onError })
    
    if (newFiles.length > 0) {
      const totalFiles = attachedFiles.length + newFiles.length
      if (totalFiles > maxFiles) {
        onError?.(`Maximum ${maxFiles} files allowed`)
        const allowedCount = maxFiles - attachedFiles.length
        onFilesChange([...attachedFiles, ...newFiles.slice(0, allowedCount)])
      } else {
        onFilesChange([...attachedFiles, ...newFiles])
      }
    }

    // Reset file input
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
        if (file) {
          files.push(file)
        }
      }
    }

    if (files.length > 0) {
      event.preventDefault()
      const newFiles = await processFiles(files, { maxSizeBytes, onError })
      if (newFiles.length > 0) {
        onFilesChange([...attachedFiles, ...newFiles])
      }
    }
  }

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const files = event.dataTransfer.files
    if (files && files.length > 0) {
      const newFiles = await processFiles(files, { maxSizeBytes, onError })
      if (newFiles.length > 0) {
        onFilesChange([...attachedFiles, ...newFiles])
      }
    }
  }

  const removeFile = (fileId: string) => {
    onFilesChange(attachedFiles.filter(f => f.id !== fileId))
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  return {
    // Expose refs and handlers for parent component
    fileInputRef,
    handleFileSelect,
    handlePaste,
    handleDrop,
    removeFile,
    triggerFileSelect,
    
    // Render file input element
    FileInput: () => (
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple
        accept={acceptedTypes.join(',')}
        style={{ display: 'none' }}
      />
    ),

    // Render image preview button (if images attached)
    ImagePreviewButton: imageFiles.length > 0 ? () => (
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
    ) : null,

    // Render image modal
    ImageModal: showImageModal && imageFiles.length > 0 ? () => (
      <ImagePreviewModal
        imageFiles={imageFiles}
        onClose={() => setShowImageModal(false)}
        onRemove={removeFile}
      />
    ) : null
  }
}

export default FileUploadHandler
