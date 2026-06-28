import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Check, FolderOpen, SettingsIcon } from '../../icons'
import type { Folder } from '../../../chat/types'

interface FolderNameDialogProps {
  open: boolean
  mode: 'create' | 'rename'
  currentName?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string, memoryMode?: Folder['memoryMode']) => void
}

export default function FolderNameDialog({
  open,
  mode,
  currentName = '',
  onOpenChange,
  onConfirm,
}: FolderNameDialogProps) {
  const [name, setName] = useState(currentName)
  const [memoryMode, setMemoryMode] = useState<Folder['memoryMode']>('default')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(currentName)
    setMemoryMode('default')
    setSettingsOpen(false)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [currentName, open])

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0

  const handleConfirm = () => {
    if (!canSubmit) return
    onConfirm(trimmedName, memoryMode)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="folder-name-dialog">
        {mode === 'create' ? (
          <button
            type="button"
            className={`folder-name-dialog__settings-button ${settingsOpen ? 'folder-name-dialog__settings-button--open' : ''}`}
            aria-label="Folder settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((prev) => !prev)}
          >
            <SettingsIcon size={15} />
          </button>
        ) : null}
        <DialogHeader>
          <DialogTitle className="theme-overlay-title">
            {mode === 'create' ? 'New folder' : 'Rename folder'}
          </DialogTitle>
          <DialogDescription className="theme-overlay-description">
            {mode === 'create'
              ? 'Keep related chats, context, and memory behavior together.'
              : 'Update the folder name shown in the sidebar.'}
          </DialogDescription>
        </DialogHeader>
        <div className="folder-name-dialog__field my-2">
          <label htmlFor="folder-name-input" className="sr-only">
            Folder name
          </label>
          <Input
            id="folder-name-input"
            ref={inputRef}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleConfirm()
              }
            }}
            placeholder="Folder name"
            className="theme-overlay-field"
          />
        </div>
        {mode === 'create' ? (
          <div className="folder-name-dialog__onboarding">
            <div className="folder-name-dialog__setup-card">
              <div className="folder-name-dialog__setup-icon" aria-hidden="true">
                <FolderOpen size={16} />
              </div>
              <div>
                <strong>Workspace setup</strong>
                <span>New chats, context, and folder memories will collect here.</span>
              </div>
            </div>
            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleContent>
                <div className="folder-name-dialog__memory-panel" aria-label="Memory mode">
                  <div className="folder-name-dialog__memory-header">
                    <div>
                      <strong>Choose memory access</strong>
                      <span>This setting is locked after the folder is created.</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`folder-name-dialog__memory-option ${memoryMode === 'default' ? 'folder-name-dialog__memory-option--active' : ''}`}
                    onClick={() => setMemoryMode('default')}
                  >
                    <span>
                      <strong>
                        Default
                        <em>Recommended</em>
                      </strong>
                      <small>Folder chats can use global memories and folder memories.</small>
                    </span>
                    {memoryMode === 'default' ? <Check size={15} /> : null}
                  </button>
                  <button
                    type="button"
                    className={`folder-name-dialog__memory-option ${memoryMode === 'folder-only' ? 'folder-name-dialog__memory-option--active' : ''}`}
                    onClick={() => setMemoryMode('folder-only')}
                  >
                    <span>
                      <strong>
                        Folder-only
                        <em>Private</em>
                      </strong>
                      <small>Folder chats use only memories saved inside this folder.</small>
                    </span>
                    {memoryMode === 'folder-only' ? <Check size={15} /> : null}
                  </button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[var(--theme-border)] bg-transparent text-[var(--theme-text-primary)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)]"
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {mode === 'create' ? 'Create' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
