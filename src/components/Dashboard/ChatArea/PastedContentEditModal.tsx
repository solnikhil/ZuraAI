/**
 * PastedContentEditModal - Modal overlay for editing pasted content
 * Full-screen overlay with textarea for editing long pasted text
 * Now using shadcn Dialog
 */

import React, { useState, useEffect, useRef } from 'react'
import { X, Check, Trash2 } from '../../icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

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

  // Focus textarea on mount
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
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[1000px] h-[85vh] flex flex-col bg-card border-border p-0">
        <DialogHeader className="px-6 py-5 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">Edit Pasted Content</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {formatCharCount(editedContent.length)} chars • Ctrl+Enter to save
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          <Textarea
            ref={textareaRef}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-secondary/50 border-border resize-none text-base leading-7"
            placeholder="Enter your content..."
          />
        </div>

        <DialogFooter className="px-6 py-5 border-t border-border flex items-center justify-between">
          <div>
            {onDelete && (
              <Button
                variant="outline"
                onClick={onDelete}
                className="text-red-400 border-red-400/20 bg-red-400/10 hover:bg-red-400/20"
              >
                <Trash2 size={16} className="mr-2" />
                Delete
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!editedContent.trim()}
            >
              <Check size={16} className="mr-2" />
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PastedContentEditModal
