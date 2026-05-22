/**
 * Composer input for chat text, attachments, and quick actions.
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Paperclip,
  ImagePlus,
  ArrowUp,
  Square,
  Plus,
  Check,
  Wrench, Monitor,
} from 'lucide-react'
import ModelSelector from '../ModelSelector/index'
import { useSettings } from '../../../contexts/SettingsContext'
import {
  canAnalyzeImageAttachments,
  isTextExtractableAttachment,
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { withWebResearchEnabled, withComputerUseEnabled } from '@/skills'
import { ComposerAttachments } from './ComposerAttachments'
import McpLibraryDialog from '@/components/mcp/McpLibraryDialog'
import { isMacOSRuntime } from '@/utils/platform'

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
  layoutVariant?: 'default' | 'landing'
}

function isInteractiveComposerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(
    target.closest(
      [
        'button',
        'a[href]',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="menuitem"]',
        '[role="option"]',
        '[data-slot="dropdown-menu-trigger"]',
        '[data-slot="popover-trigger"]',
        '[data-slot="select-trigger"]',
      ].join(', ')
    )
  )
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
  layoutVariant = 'default',
}: InputAreaProps) {
  const isLandingVariant = layoutVariant === 'landing'
  const MAX_ATTACHMENTS = 10
  const [isDragging, setIsDragging] = React.useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = React.useState(false)
  const [mcpDialogMode, setMcpDialogMode] = React.useState<'resources' | 'prompts' | null>(null)
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 36,
    maxHeight: 200,
  })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { settings, updateSettings } = useSettings()
  const { animationsEnabled } = useMotionPreferences()
  
  const webResearchEnabled = settings.skills?.web_research?.enabled !== false
  const computerUseAvailable = !isMacOSRuntime()
  const computerUseEnabled = settings.skills?.computer_use?.enabled === true
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

      const unsupportedDocuments = acceptedIncoming.filter(
        (file) => file.type !== 'image' && !isTextExtractableAttachment(file)
      )
      if (unsupportedDocuments.length > 0) {
        onError?.(
          `These attachments are not supported yet: ${unsupportedDocuments
            .map((file) => file.name)
            .join(', ')}. Use text-based files like .txt, .md, .csv, .json, or .xml.`
        )
        acceptedIncoming = acceptedIncoming.filter((file) => !unsupportedDocuments.includes(file))
      }

      if (!canUseImageUploads) {
        const nonImageFiles = acceptedIncoming.filter((file) => file.type !== 'image')
        if (nonImageFiles.length !== acceptedIncoming.length) {
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
        if (attachedFiles.length > 0) {
          onFilesChange([])
        }
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

  const toggleComputerUseSkill = React.useCallback(() => {
    const nextEnabled = !computerUseEnabled
    updateSettings({
      skills: withComputerUseEnabled(settings.skills, nextEnabled),
    })
  }, [settings.skills, updateSettings, computerUseEnabled])

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

  const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isInteractiveComposerTarget(event.target)) return

    onActivity?.()
    textareaRef.current?.focus()
  }

  const canSend = !isLoading && (input.trim() || attachedFiles.length > 0)
  const showAttachmentRail = attachedFiles.length > 0
  const placeholder = isDragging
    ? 'Drop files here...'
    : 'Enter your message to continue...'
  const composerWidthClass = isLandingVariant
    ? 'max-w-[min(745px,100%)]'
    : 'max-w-full'
  const shellRadiusClass = 'rounded-[24px] md:rounded-[26px]'
  const shellPaddingClass = showAttachmentRail
    ? 'px-3 py-3'
    : 'px-3 py-2.5'
  const controlClusterClass = 'flex items-center gap-2'
  const secondaryControlButtonClass =
    'theme-control-btn inline-flex h-9 w-9 items-center justify-center rounded-full p-2'
  const stopButtonClass =
    'theme-control-btn h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--theme-error-bg)_52%,transparent)] p-2 text-[var(--theme-error)] hover:!bg-[var(--theme-error-bg)] hover:!text-[var(--theme-error)]'
  const sendButtonClass = cn(
    'theme-control-btn h-9 w-9 rounded-full p-2',
    canSend
      ? 'bg-[color-mix(in_srgb,var(--theme-surface)_88%,var(--theme-accent-muted)_12%)] text-[var(--theme-text-primary)]'
      : 'cursor-default bg-transparent text-[var(--theme-text-muted)] opacity-60'
  )

  const quickActionsMenu = (
    <DropdownMenu open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
      <DropdownMenuTrigger asChild>
        <motion.button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(secondaryControlButtonClass, quickActionsOpen && 'is-active')}
          aria-label="Open quick actions"
        >
          <Plus size={18} />
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        alignOffset={0}
        side="top"
        sideOffset={6}
        className="w-[280px] rounded-[20px] p-1.5"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              fileInputRef.current?.click()
            }}
            className="group/menu-item h-11 rounded-[14px] px-2.5 text-[13px]"
          >
            <Paperclip className="h-4 w-4 text-[var(--theme-text-secondary)]" />
            <span>Add photos & files</span>
            <DropdownMenuShortcut className="text-[11px] opacity-0 group-hover/menu-item:opacity-100">
              Ctrl+U
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="mx-0 my-1 h-px" />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="h-11 rounded-[14px] px-2.5 text-[13px]">
            <Wrench className="h-4 w-4 text-[var(--theme-text-secondary)]" />
            <span>MCP Library</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={8}
            collisionPadding={12}
            className="w-[260px] rounded-[20px] p-1.5"
          >
            <DropdownMenuItem
              onSelect={() => {
                setMcpDialogMode('resources')
                setQuickActionsOpen(false)
              }}
              className="group/menu-item h-11 rounded-[14px] px-2.5 text-[13px]"
            >
              <Wrench className="h-4 w-4 text-[var(--theme-text-secondary)]" />
              <span>Browse resources</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setMcpDialogMode('prompts')
                setQuickActionsOpen(false)
              }}
              className="group/menu-item h-11 rounded-[14px] px-2.5 text-[13px]"
            >
              <Wrench className="h-4 w-4 text-[var(--theme-text-secondary)]" />
              <span>Browse prompts</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="h-11 rounded-[14px] px-2.5 text-[13px]">
            <Wrench className="h-4 w-4 text-[var(--theme-text-secondary)]" />
            <span>Skills</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            sideOffset={8}
            collisionPadding={12}
            className="w-[260px] rounded-[20px] p-1.5"
          >
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                toggleWebResearchSkill()
              }}
              className="group/menu-item h-11 rounded-[14px] px-2.5 text-[13px]"
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
  )

  const insertMcpTextIntoComposer = React.useCallback(
    (text: string) => {
      const hasMeaningfulInput = input.trim().length > 0
      const separator = !hasMeaningfulInput
        ? ''
        : input.endsWith('\n\n')
          ? ''
          : input.endsWith('\n')
            ? '\n'
            : '\n\n'
      const nextValue = hasMeaningfulInput ? `${input}${separator}${text}` : text
      setInput(nextValue)
      adjustHeight()
      requestAnimationFrame(() => textareaRef.current?.focus())
      onActivity?.()
    },
    [adjustHeight, input, onActivity, setInput, textareaRef]
  )

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
        className="w-full pb-0 pt-3"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseMove={handleMouseMoveActivity}
      >
        <div className={cn('relative mx-auto w-full', composerWidthClass)}>
          <div
            role="group"
            aria-label="Chat composer"
            className={cn(
              'relative flex w-full flex-col overflow-hidden text-left cursor-text',
              'theme-composer-surface',
              shellRadiusClass,
              shellPaddingClass,
              isDragging && 'ring-2 ring-[var(--theme-accent)]'
            )}
            onClick={handleContainerClick}
          >
            <AnimatePresence initial={false}>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fastTransition}
                  className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[26px] border border-dashed border-[var(--theme-accent)] bg-[color-mix(in_srgb,var(--theme-accent)_10%,var(--theme-surface))]"
                >
                  <div className="flex items-center gap-3 rounded-full bg-[var(--theme-surface)] px-4 py-2 text-sm text-[var(--theme-text-primary)] shadow-lg">
                    <ImagePlus className="h-4 w-4 text-[var(--theme-accent)]" />
                    Drop files to attach them
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {showAttachmentRail && <ComposerAttachments files={attachedFiles} onRemove={removeFile} />}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml"
              className="hidden"
            />

            <div className="flex flex-col gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                placeholder={placeholder}
                rows={1}
                className={cn(
                  'block min-h-[44px] w-full appearance-none overflow-y-auto rounded-[18px] border-none bg-transparent px-2 py-2 text-[0.98rem] leading-[22px] md:text-[0.98rem] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] shadow-none transition-colors duration-200 resize-none focus-visible:ring-0'
                )}
                onFocus={() => {
                  onFocusChange?.(true)
                  onActivity?.()
                }}
                onBlur={() => {
                  onFocusChange?.(false)
                }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onChange={(e) => {
                  setInput(e.target.value)
                  adjustHeight()
                  onActivity?.()
                }}
              />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 shrink-0">
                  <div className={controlClusterClass}>{quickActionsMenu}</div>

                  {computerUseAvailable && (
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={controlClusterClass}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleComputerUseSkill()
                              }}
                              className={cn(
                                secondaryControlButtonClass,
                                computerUseEnabled
                                  ? 'bg-emerald-500/10 text-emerald-500'
                                  : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
                              )}
                              aria-label={computerUseEnabled ? 'Disable Computer Use' : 'Enable Computer Use'}
                            >
                              <Monitor size={16} />
                            </button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="rounded-full">
                          {computerUseEnabled ? 'Computer Use: On' : 'Computer Use: Off'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                <div className="flex min-w-0 items-center justify-end gap-2">
                  <div className={cn(controlClusterClass, 'min-w-0')}>
                    {showContextRing && (
                      <TokenUsageIndicator
                        input={input}
                        attachedFiles={attachedFiles}
                        className="h-9 w-9 text-[var(--theme-text-muted)]"
                      />
                    )}
                    <ModelSelector minimal={true} popoverAlign="end" />
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
                            className={stopButtonClass}
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
                                setInput('')
                                adjustHeight(true)
                                if (attachedFiles.length > 0) {
                                  onFilesChange([])
                                }
                              }
                            }}
                            disabled={!canSend}
                            className={sendButtonClass}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="rounded-full">
                          Send message
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {mcpDialogMode && (
        <McpLibraryDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setMcpDialogMode(null)
            }
          }}
          initialMode={mcpDialogMode}
          onInsertText={insertMcpTextIntoComposer}
        />
      )}
    </TooltipProvider>
  )
}

export default InputArea
