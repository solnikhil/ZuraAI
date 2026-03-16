import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface RenameChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTitle: string
  onConfirm: (newTitle: string) => void
}

export default function RenameChatDialog({
  open,
  onOpenChange,
  currentTitle,
  onConfirm,
}: RenameChatDialogProps) {
  const [title, setTitle] = useState(currentTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle(currentTitle)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [open, currentTitle])

  const handleConfirm = () => {
    const trimmed = title.trim()
    onConfirm(trimmed || currentTitle)
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text-primary)] shadow-none"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--theme-text-primary)]">
            Rename chat
          </DialogTitle>
          <DialogDescription className="text-[var(--theme-text-muted)]">
            Enter a new name for this conversation.
          </DialogDescription>
        </DialogHeader>
        <div className="my-2">
          <label htmlFor="rename-chat-input" className="sr-only">
            Chat name
          </label>
          <input
            id="rename-chat-input"
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface-hover)] px-3 py-2 text-sm text-[var(--theme-text-primary)] outline-none focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]"
            placeholder="Chat name"
            aria-describedby="rename-chat-description"
          />
          <p id="rename-chat-description" className="sr-only">
            Enter a name for this chat session
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[var(--theme-border)] bg-transparent text-[var(--theme-text-primary)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)]"
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}