/**
 * Composer input for chat text, attachments, and quick actions.
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Paperclip,
  ImagePlus,
  SendHorizonal,
  Square,
  Plus,
  Check,
  Wrench,
} from 'lucide-react'
import ModelSelector from '../ModelSelector/index'
import { useSettings } from '../../../contexts/SettingsContext'
import {
  canAnalyzeImageAttachments,
  mergeAttachedFiles,
  processFiles,
  providerSupportsVisionUploads,
  type AttachedFile,
} from './attachmentUtils'
import { TokenUsageIndicator } from './TokenUsageIndicator'
import { SkillLogo } from '@/components/shared'
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import {
  maybeAnimate,
  motionDuration,
  motionDurations,
  motionEasing,
  useMotionPreferences,
} from '@/lib/motion'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { withWebResearchEnabled } from '@/skills'
import { ComposerAttachments } from './ComposerAttachments'

export interface InputAreaProps {
  input: string
  setInput: (value: string) => void
  onSend: () => void
  onStop?: () => void
  isLoading: boolean
  attachedFiles: AttachedFile[]
  onFilesChange: (files: AttachedFile[]) => void
  onError?: (message: string) => void
  showContextRing?: boolean
  /** Called on any user activity inside the prompt area (typing, click, focus, mouse move) */
  onActivity?: () => void
  /** Called when textarea focus state changes */
  onFocusChange?: (focused: boolean) => void
  /** Expose the textarea ref to the parent (for keyboard reactivation focus) */
  textareaRefCallback?: (ref: React.RefObject<HTMLTextAreaElement | null>) => void
}
export function InputArea({
  input,
  setInput,
  onSend,
  onStop,
  isLoading,
  attachedFiles,
  onFilesChange,
  onError,
  showContextRing = true,
  onActivity,
  onFocusChange,
  textareaRefCallback,
}: InputAreaProps) {
  const MAX_ATTACHMENTS = 10
  const [isDragging, setIsDragging] = React.useState(false)
  const [isFocused, setIsFocused] = React.useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = React.useState(false)
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 200,
  })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { settings, updateSettings } = useSettings()
  const { animationsEnabled } = useMotionPreferences()
  const { frostedPrompt } = settings
  const webResearchEnabled = settings.skills?.web_research?.enabled !== false
  const standardTransition = {
    duration: motionDuration(animationsEnabled, motionDurations.normal),
    ease: motionEasing.standard,
  }
  const fastTransition = {
    duration: motionDuration(animationsEnabled, motionDurations.fast),
    ease: motionEasing.standard,
  }

  // Expose textarea ref to parent for keyboard reactivation
  React.useEffect(() => {
    textareaRefCallback?.(textareaRef)
  }, [textareaRef, textareaRefCallback])

  const visionUploadsAvailable = providerSupportsVisionUploads(settings.modelProvider)
  const canUseImageUploads = canAnalyzeImageAttachments(settings)

  const commitFiles = React.useCallback(
    (incoming: AttachedFile[]) => {
      let acceptedIncoming = incoming

      if (!canUseImageUploads) {
        const nonImageFiles = incoming.filter((file) => file.type !== 'image')
        if (nonImageFiles.length !== incoming.length) {
          onError?.(
            visionUploadsAvailable
              ? 'Select a vision-capable model to attach images.'
              : 'Image attachments are not available for the current provider.'
          )
        }
        acceptedIncoming = nonImageFiles
      }

      if (acceptedIncoming.length === 0) return

      const merged = mergeAttachedFiles(attachedFiles, acceptedIncoming)
      if (merged.length === attachedFiles.length) return

      if (merged.length > MAX_ATTACHMENTS) {
        onError?.(`You can attach up to ${MAX_ATTACHMENTS} items at a time.`)
      }

      onFilesChange(merged.slice(0, MAX_ATTACHMENTS))
    },
    [attachedFiles, canUseImageUploads, onError, onFilesChange, visionUploadsAvailable]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && (input.trim() || attachedFiles.length > 0)) {
        onSend()
        setInput('')
        adjustHeight(true)
      }
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newFiles = await processFiles(files, { onError })
    commitFiles(newFiles)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleWebResearchSkill = React.useCallback(() => {
    const nextEnabled = !webResearchEnabled
    updateSettings({
      skills: withWebResearchEnabled(settings.skills, nextEnabled),
    })
  }, [settings.skills, updateSettings, webResearchEnabled])

  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const isMeta = event.ctrlKey || event.metaKey
      if (!isMeta) return

      const activeElement = document.activeElement
      const isComposerActive = activeElement === textareaRef.current
      if (!isComposerActive) return

      const key = event.key.toLowerCase()
      if (!event.shiftKey && key === 'u') {
        event.preventDefault()
        fileInputRef.current?.click()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [textareaRef])

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
      commitFiles(newFiles)
      return
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
      commitFiles(newFiles)
    }
  }

  const removeFile = (fileId: string) => {
    onFilesChange(attachedFiles.filter((f) => f.id !== fileId))
  }

  const handleContainerClick = () => {
    onActivity?.()
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const canSend = !isLoading && (input.trim() || attachedFiles.length > 0)
  const showAttachmentRail = attachedFiles.length > 0
  const placeholder = isDragging ? 'Drop files here...' : 'Enter your message to continue...'

  // Throttled mouse-move activity signal (fire at most once per 2s)
  const lastMouseActivityRef = React.useRef(0)
  const handleMouseMoveActivity = React.useCallback(() => {
    const now = Date.now()
    if (now - lastMouseActivityRef.current > 2000) {
      lastMouseActivityRef.current = now
      onActivity?.()
    }
  }, [onActivity])

  return (
    <TooltipProvider>
      <div
        className="w-full py-4"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseMove={handleMouseMoveActivity}
      >
        <div className="relative w-full mx-auto">
          <motion.div
            role="textbox"
            tabIndex={0}
            aria-label="Chat input container"
            initial={false}
            animate={{
              boxShadow: quickActionsOpen
                ? 'none'
                : frostedPrompt
                  ? isFocused
                    ? '0 0 0 1px rgba(255, 255, 255, 0.1), 0 2px 12px rgba(0, 0, 0, 0.2)'
                    : '0 0 0 1px rgba(255, 255, 255, 0.05), 0 1px 4px rgba(0, 0, 0, 0.15)'
                  : isFocused
                    ? '0 0 0 1px rgba(255, 255, 255, 0.2), 0 4px 24px rgba(0, 0, 0, 0.4)'
                    : '0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
            transition={standardTransition}
            className={cn(
              'relative flex flex-col rounded-2xl w-full text-left cursor-text overflow-hidden p-1.5',
              frostedPrompt ? 'zura-frosted-prompt' : 'theme-composer-surface',
              showAttachmentRail ? 'pt-3' : 'pt-2',
              isDragging && 'ring-2 ring-[var(--theme-accent)]'
            )}
            onClick={handleContainerClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleContainerClick()
              }
            }}
          >
            <AnimatePresence initial={false}>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fastTransition}
                  className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[22px] border border-dashed border-[var(--theme-accent)] bg-[color-mix(in_srgb,var(--theme-accent)_10%,var(--theme-surface))]"
                >
                  <div className="flex items-center gap-3 rounded-full bg-[var(--theme-surface)] px-4 py-2 text-sm text-[var(--theme-text-primary)] shadow-lg">
                    <ImagePlus className="h-4 w-4 text-[var(--theme-accent)]" />
                    Drop files to attach them
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {showAttachmentRail && <ComposerAttachments files={attachedFiles} onRemove={removeFile} />}

            <div className="px-2 pb-1">
              <div className="overflow-y-auto max-h-[200px]">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  placeholder={placeholder}
                  className={cn(
                    'w-full rounded-xl border-none px-4 py-3.5 resize-none focus-visible:ring-0 leading-[1.45] shadow-none',
                    'bg-transparent',
                    'text-[var(--theme-text-primary)]',
                    'placeholder:text-[var(--theme-text-muted)]',
                    'transition-colors duration-200'
                  )}
                  onFocus={() => {
                    setIsFocused(true)
                    onFocusChange?.(true)
                    onActivity?.()
                  }}
                  onBlur={() => {
                    setIsFocused(false)
                    onFocusChange?.(false)
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onChange={(e) => {
                    setInput(e.target.value)
                    adjustHeight()
                    onActivity?.()
                  }}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-2">
              <div className="flex items-center gap-1.5">
                <DropdownMenu open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
                  <DropdownMenuTrigger asChild>
                    <motion.button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'theme-control-btn h-8 w-8 inline-flex items-center justify-center rounded-[10px]',
                        quickActionsOpen && 'is-active'
                      )}
                      aria-label="Open quick actions"
                    >
                      <Plus size={20} />
                    </motion.button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    alignOffset={0}
                    side="top"
                    sideOffset={2}
                    className="w-[248px] rounded-xl p-1.5"
                  >
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault()
                        fileInputRef.current?.click()
                        setQuickActionsOpen(false)
                      }}
                      className="group/menu-item h-9 px-2.5 text-[13px]"
                    >
                      <Paperclip className="h-4 w-4 text-[var(--theme-text-secondary)]" />
                      <span>Add photos & files</span>
                      <span className="theme-menu-shortcut ml-auto text-[11px] opacity-0 group-hover/menu-item:opacity-100">
                        Ctrl+U
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="mx-3 my-1 h-px" />

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="h-9 px-2.5 text-[13px]">
                        <Wrench className="h-4 w-4 text-[var(--theme-text-secondary)]" />
                        <span>Skills</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        sideOffset={-10}
                        className="w-[220px] rounded-xl p-1.5"
                      >
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            toggleWebResearchSkill()
                            setQuickActionsOpen(false)
                          }}
                          className="group/menu-item h-9 px-2.5 text-[13px]"
                        >
                          <SkillLogo skill="tavily" size={16} />
                          <span>Tavily</span>
                          {webResearchEnabled && (
                            <span className="ml-auto inline-flex items-center text-[var(--theme-success)]">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>

                {showContextRing && <TokenUsageIndicator input={input} />}
              </div>

              <div className="flex items-center gap-2">
                <ModelSelector minimal={true} popoverAlign="end" />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept="image/*,.pdf,.txt,.doc,.docx,.csv,.json,.xml"
                  className="hidden"
                />

                {isLoading ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        type="button"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        whileHover={maybeAnimate(animationsEnabled, { scale: 1.04 })}
                        whileTap={maybeAnimate(animationsEnabled, { scale: 0.96 })}
                        onClick={(e) => {
                          e.stopPropagation()
                          onStop?.()
                        }}
                        className="theme-control-btn rounded-lg p-2 text-[var(--theme-error)] hover:!bg-[var(--theme-error-bg)] hover:!text-[var(--theme-error)]"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-full">
                      Stop generating
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        type="button"
                        whileHover={
                          canSend ? maybeAnimate(animationsEnabled, { scale: 1.04 }) : undefined
                        }
                        whileTap={
                          canSend ? maybeAnimate(animationsEnabled, { scale: 0.96 }) : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          if (canSend) {
                            onSend()
                          }
                        }}
                        disabled={!canSend}
                        className={cn(
                          'theme-control-btn rounded-lg p-2',
                          canSend
                            ? 'text-[var(--theme-text-primary)]'
                            : 'cursor-default text-[var(--theme-text-muted)] opacity-60'
                        )}
                      >
                        <SendHorizonal className="w-4 h-4" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-full">
                      Send message
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default InputArea
