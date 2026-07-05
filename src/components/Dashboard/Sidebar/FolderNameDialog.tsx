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
import { Check, FolderOpen, SettingsIcon } from '../../icons'
import type { Folder } from '../../../chat/types'
import '../FoldersView.css'

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
  const [settingsMounted, setSettingsMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const settingsDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setName(currentName)
    setMemoryMode('default')
    setSettingsOpen(false)
    setSettingsMounted(false)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }, [currentName, open])

  useEffect(() => {
    if (settingsOpen) {
      setSettingsMounted(true)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSettingsMounted(false)
    }, 120)

    return () => window.clearTimeout(timeoutId)
  }, [settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      if (settingsButtonRef.current?.contains(target)) return
      if (settingsDropdownRef.current?.contains(target)) return

      setSettingsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [settingsOpen])

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0

  const handleConfirm = () => {
    if (!canSubmit) return
    onConfirm(trimmedName, memoryMode)
    onOpenChange(false)
  }

  const toggleSettings = () => {
    setSettingsOpen((prev) => !prev)
  }

  const nameField = (
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
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="folder-name-dialog">
        {mode === 'create' ? (
          <>
            <button
              ref={settingsButtonRef}
              type="button"
              className={`folder-name-dialog__settings-button ${settingsOpen ? 'folder-name-dialog__settings-button--open' : ''}`}
              aria-label="Folder settings"
              aria-expanded={settingsOpen}
              aria-haspopup="dialog"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                toggleSettings()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                toggleSettings()
              }}
            >
              <SettingsIcon size={15} />
            </button>
            {settingsMounted ? (
              <div
                ref={settingsDropdownRef}
                className="folder-name-dialog__settings-dropdown"
                data-state={settingsOpen ? 'open' : 'closed'}
                role="dialog"
                aria-label="Folder settings"
                onPointerDown={(event) => event.stopPropagation()}
              >
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
            ) : null}
            <DialogHeader>
              <DialogTitle className="theme-overlay-title">New folder</DialogTitle>
              <DialogDescription className="theme-overlay-description">
                Keep related chats, context, and memory behavior together.
              </DialogDescription>
            </DialogHeader>
            {nameField}
            <div className="folder-name-dialog__onboarding">
              <div className="folder-name-dialog__setup-card">
                <div className="folder-name-dialog__setup-icon" aria-hidden="true">
                  <FolderOpen size={16} />
                </div>
                <div className="folder-name-dialog__setup-copy">
                  <strong>Workspace setup</strong>
                  <span>New chats, context, and folder memories will collect here.</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="theme-overlay-title">Rename folder</DialogTitle>
              <DialogDescription className="theme-overlay-description">
                Update the folder name shown in the sidebar.
              </DialogDescription>
            </DialogHeader>
            {nameField}
          </>
        )}
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
