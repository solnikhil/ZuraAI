import { useState, useRef, useEffect } from 'react'
import { RotateCcw, CornerDownLeft } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface RegenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegenerate: (instruction: string) => void
}

export function RegenerateDialog({ open, onOpenChange, onRegenerate }: RegenerateDialogProps) {
  const [instruction, setInstruction] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Reset and focus when dialog opens
  useEffect(() => {
    if (open) {
      setInstruction('')
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }
  }, [open])

  const handleRegenerate = () => {
    onRegenerate(instruction.trim())
    onOpenChange(false)
    setInstruction('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="max-w-[500px] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--theme-border)] px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--theme-accent-muted)] text-[var(--theme-accent)]">
              <RotateCcw size={16} />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-[0.95rem] text-[var(--theme-text-primary)]">
                Regenerate Response
              </DialogTitle>
              <DialogDescription className="text-[0.78rem] text-[var(--theme-text-muted)]">
                Leave empty to regenerate normally.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <Textarea
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='Describe what you want to change... (e.g., "make it more concise", "add code examples", "explain in simpler terms")'
            className="min-h-[80px] max-h-[200px] resize-y rounded-xl border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] px-3 py-3 text-[0.9rem] shadow-none focus-visible:border-[var(--theme-accent)] focus-visible:ring-[var(--theme-accent-muted)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleRegenerate()
              } else if (e.key === 'Escape') {
                onOpenChange(false)
              }
            }}
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[var(--theme-text-muted)]">
              <CornerDownLeft size={12} />
              <span>Cmd+Enter to regenerate</span>
            </div>

            <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleRegenerate} className="gap-2">
                <RotateCcw size={14} />
                Regenerate
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
