/**
 * Full-window file drop overlay for the main app shell.
 * Shows when external files are dragged over the window and delivers them
 * to the chat composer via ComposerDraftContext.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImagePlus } from 'lucide-react'
import { useAppShell } from '@/contexts/AppShellContext'
import { useComposerDraft } from '@/contexts/ComposerDraftContext'
import './WindowFileDropOverlay.css'

function dataTransferHasFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false
  // `types` is a DOMStringList / array-like; prefer includes when available.
  const types = dataTransfer.types
  if (!types) return false
  if (typeof types.includes === 'function') {
    return types.includes('Files')
  }
  return Array.from(types as ArrayLike<string>).includes('Files')
}

export default function WindowFileDropOverlay() {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const dragDepthRef = useRef(0)
  const navigate = useNavigate()
  const { setDashboardView } = useAppShell()
  const { deliverIncomingFiles } = useComposerDraft()

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
  }, [])

  const handleDroppedFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return

      // Ensure the chat composer is visible so attachments can be accepted.
      navigate('/dashboard')
      setDashboardView('chat')
      deliverIncomingFiles(list)
    },
    [deliverIncomingFiles, navigate, setDashboardView]
  )

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return
      event.preventDefault()
      dragDepthRef.current += 1
      setIsDraggingFiles(true)
    }

    const onDragLeave = (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return
      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDraggingFiles(false)
      }
    }

    const onDragOver = (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy'
      }
      // Keep overlay visible if a browser resets depth inconsistently.
      setIsDraggingFiles(true)
    }

    const onDrop = (event: DragEvent) => {
      const hasFiles = dataTransferHasFiles(event.dataTransfer)
      resetDragState()
      if (!hasFiles) return

      event.preventDefault()
      event.stopPropagation()

      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        handleDroppedFiles(files)
      }
    }

    // Escape hatch if the OS cancels the drag outside the window.
    const onDragEnd = () => {
      resetDragState()
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onDragEnd)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onDragEnd)
    }
  }, [handleDroppedFiles, resetDragState])

  if (!isDraggingFiles) return null

  return (
    <div className="window-file-drop-overlay" role="dialog" aria-modal="true" aria-label="Drop files to attach">
      <div className="window-file-drop-overlay__scrim" />
      <div className="window-file-drop-overlay__frame">
        <div className="window-file-drop-overlay__card">
          <div className="window-file-drop-overlay__icon-wrap" aria-hidden="true">
            <ImagePlus className="window-file-drop-overlay__icon" />
          </div>
          <div className="window-file-drop-overlay__title">Drop files to attach</div>
          <div className="window-file-drop-overlay__subtitle">
            Images and text files · up to 10 at a time
          </div>
        </div>
      </div>
    </div>
  )
}
