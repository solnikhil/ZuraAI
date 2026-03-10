/**
 * InputArea - KokonutUI-inspired AI Prompt Input
 * Handles text input, file attachment triggers, and submit
 * 
 * Based on: https://kokonutui.com/docs/components/ai-prompt
 *           https://kokonutui.com/docs/components/ai-input-search
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Paperclip, Image, X, SendHorizonal, Square, Plus, Check, Wrench, Radar } from 'lucide-react'
import ModelSelector from '../ModelSelector/index'
import { useSettings } from '../../../contexts/SettingsContext'
import { processFiles, type AttachedFile } from './FileUploadHandler'
import { TokenUsageIndicator } from './TokenUsageIndicator'
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { withWebResearchEnabled } from '../../../skills'

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

/**
 * InputArea Component - KokonutUI-inspired AI Prompt Input
 */
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
  const [isDragging, setIsDragging] = React.useState(false)
  const [showImageModal, setShowImageModal] = React.useState(false)
  const [isFocused, setIsFocused] = React.useState(false)
  const [quickActionsOpen, setQuickActionsOpen] = React.useState(false)
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 200,
  })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const imageOnlyInputRef = React.useRef<HTMLInputElement>(null)
  const { settings, updateSettings } = useSettings()
  const { frostedPrompt } = settings
  const webResearchEnabled = settings.skills?.web_research?.enabled !== false

  // Expose textarea ref to parent for keyboard reactivation
  React.useEffect(() => {
    textareaRefCallback?.(textareaRef)
  }, [textareaRef, textareaRefCallback])

  const imageFiles = attachedFiles.filter(f => f.type === 'image')

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
    if (newFiles.length > 0) {
      onFilesChange([...attachedFiles, ...newFiles])
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newFiles = await processFiles(files, { onError })
    if (newFiles.length > 0) {
      onFilesChange([...attachedFiles, ...newFiles])
    }

    if (imageOnlyInputRef.current) {
      imageOnlyInputRef.current.value = ''
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
      if (newFiles.length > 0) {
        onFilesChange([...attachedFiles, ...newFiles])
      }
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
      if (newFiles.length > 0) {
        onFilesChange([...attachedFiles, ...newFiles])
      }
    }
  }

  const removeFile = (fileId: string) => {
    onFilesChange(attachedFiles.filter(f => f.id !== fileId))
  }

  const handleContainerClick = () => {
    onActivity?.()
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const canSend = !isLoading && (input.trim() || attachedFiles.length > 0)
  const showAttachmentBanner = attachedFiles.length > 0

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
          {/* Attached Files Badges */}
          <AnimatePresence>
            {attachedFiles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mb-2 flex flex-wrap gap-1.5"
              >
                {attachedFiles.map(file => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Badge
                      variant="secondary"
                      className="gap-1 pr-1 bg-white/5 hover:bg-white/10 text-white/80 transition-colors"
                    >
                      <span className="max-w-[100px] truncate text-xs">{file.name}</span>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Input Container - KokonutUI style */}
          <motion.div
            role="textbox"
            tabIndex={0}
            aria-label="Chat input container"
            initial={false}
            animate={{
              boxShadow: quickActionsOpen
                ? "none"
                : frostedPrompt
                ? (isFocused
                  ? "0 0 0 1px rgba(255, 255, 255, 0.1), 0 2px 12px rgba(0, 0, 0, 0.2)"
                  : "0 0 0 1px rgba(255, 255, 255, 0.05), 0 1px 4px rgba(0, 0, 0, 0.15)")
                : (isFocused
                  ? "0 0 0 1px rgba(255, 255, 255, 0.2), 0 4px 24px rgba(0, 0, 0, 0.4)"
                  : "0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.3)")
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "relative flex flex-col rounded-2xl w-full text-left cursor-text overflow-hidden p-1.5",
              quickActionsOpen ? "bg-[#292929]" : frostedPrompt ? "zura-frosted-prompt" : "bg-[#292929]",
              showAttachmentBanner ? "pt-3" : "pt-2",
              isDragging && "ring-2 ring-[var(--theme-accent)]"
            )}
            onClick={handleContainerClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleContainerClick()
              }
            }}
          >
            <AnimatePresence initial={false}>
              {showAttachmentBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="mx-2 mb-2.5 flex items-center gap-2 text-xs"
                >
                  <div className="flex flex-1 items-center gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-white/70">
                      AA
                    </span>
                    <span className="text-white/70 tracking-tighter">is free this weekend!</span>
                  </div>
                  <span className="text-white/50 tracking-tighter">Ship Now!</span>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="overflow-y-auto max-h-[200px]">
              <Textarea
                ref={textareaRef}
                value={input}
                placeholder={isDragging ? "Drop files here..." : "Type / for commands"}
                className={cn(
                  "w-full rounded-xl rounded-b-none px-4 py-3.5 border-none resize-none focus-visible:ring-0 leading-[1.4] shadow-none",
                  "bg-transparent",
                  "text-[var(--theme-text-primary)]",
                  "placeholder:text-[var(--theme-text-muted)]",
                  "transition-colors duration-200"
                )}
                onFocus={() => { setIsFocused(true); onFocusChange?.(true); onActivity?.() }}
                onBlur={() => { setIsFocused(false); onFocusChange?.(false) }}
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

            {/* Bottom Controls Bar - same background as container */}
            <div className="h-12 rounded-b-xl relative bg-transparent">
              {/* Left side controls */}
              <div className="absolute left-3 bottom-3 flex items-center gap-1.5">
                <DropdownMenu open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
                  <DropdownMenuTrigger asChild>
                    <motion.button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "h-8 w-8 inline-flex items-center justify-center rounded-[10px] border border-transparent text-white/70 transition-[color,background-color,border-color,box-shadow] duration-150",
                        "hover:text-white hover:bg-[#1d1d1d] hover:border-white/[0.06] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                        quickActionsOpen && "bg-[#1d1d1d] border-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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
                    style={{
                      boxShadow: 'none',
                      backdropFilter: 'none',
                      WebkitBackdropFilter: 'none',
                    }}
                    className={cn(
                      "w-[248px] rounded-xl border border-white/10 bg-[#232323] p-1.5 text-white shadow-none data-[state=open]:animate-none data-[state=closed]:animate-none"
                    )}
                  >
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault()
                        fileInputRef.current?.click()
                        setQuickActionsOpen(false)
                      }}
                      className="group/menu-item h-9 rounded-lg border border-transparent px-2.5 text-[13px] text-white/90 transition-[color,background-color,box-shadow] duration-150 hover:bg-[#1d1d1d] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:bg-[#1d1d1d] focus:text-white focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      <Paperclip className="h-4 w-4 text-white/75" />
                      <span>Add files or photos</span>
                      <span className="ml-auto text-[11px] text-white/40 opacity-0 transition-opacity duration-150 group-hover/menu-item:opacity-100">
                        Ctrl+U
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="mx-3 my-1 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.04)_15%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.04)_85%,transparent_100%)]" />

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="h-9 rounded-lg border border-transparent px-2.5 text-[13px] text-white/90 transition-[color,background-color,box-shadow] duration-150 hover:bg-[#1d1d1d] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:bg-[#1d1d1d] focus:text-white focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] data-[state=open]:border-transparent data-[state=open]:bg-[#1d1d1d] data-[state=open]:text-white data-[state=open]:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <Wrench className="h-4 w-4 text-white/75" />
                        <span>Skills</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        sideOffset={-10}
                        className="w-[220px] rounded-xl border border-white/10 bg-[#232323] p-1.5 text-white shadow-none"
                      >
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            toggleWebResearchSkill()
                            setQuickActionsOpen(false)
                          }}
                          className="group/menu-item h-9 rounded-lg border border-transparent px-2.5 text-[13px] text-white/90 transition-[color,background-color,box-shadow] duration-150 hover:bg-[#1d1d1d] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:bg-[#1d1d1d] focus:text-white focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        >
                          <Radar className="h-4 w-4 text-white/75" />
                          <span>Tavily</span>
                          {webResearchEnabled && (
                            <span className="ml-auto inline-flex items-center text-emerald-300">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>

                {showContextRing && <TokenUsageIndicator input={input} />}

                {/* Images button */}
                <AnimatePresence>
                  {imageFiles.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: "auto" }}
                      exit={{ opacity: 0, scale: 0.8, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center"
                    >
                      <div className="mx-1 h-4 w-px bg-white/10" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowImageModal(true)
                            }}
                            className="h-8 px-2 gap-1 flex items-center text-white/70 hover:text-white rounded-lg transition-colors"
                          >
                            <Image size={16} />
                            {imageFiles.length > 1 && (
                              <span className="text-xs font-medium">{imageFiles.length}</span>
                            )}
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="rounded-full">
                          {imageFiles.length} image{imageFiles.length > 1 ? 's' : ''} attached
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right side controls - Model + Send */}
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <ModelSelector minimal={true} popoverAlign="end" />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept="image/*,.txt,.doc,.docx,.csv,.json,.xml"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={imageOnlyInputRef}
                  onChange={handleImageSelect}
                  multiple
                  accept="image/*"
                  className="hidden"
                />

                {/* Send / Stop button */}
                {isLoading ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        type="button"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onStop?.()
                        }}
                        className="rounded-lg p-2 transition-all duration-150 text-white hover:bg-red-500/20 hover:text-red-400"
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
                        whileHover={canSend ? { scale: 1.05 } : {}}
                        whileTap={canSend ? { scale: 0.95 } : {}}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (canSend) {
                            onSend()
                          }
                        }}
                        disabled={!canSend}
                        className={cn(
                          "rounded-lg p-2 transition-all duration-150",
                          canSend
                            ? "text-white hover:bg-white/10"
                            : "text-white/30"
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

      {/* Image Preview Modal */}
      <AnimatePresence>
        {showImageModal && imageFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-5"
            onClick={() => setShowImageModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative w-[90%] max-w-[800px] max-h-[90%] rounded-2xl bg-neutral-900 shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-lg font-medium text-white">
                  Attached Images ({imageFiles.length})
                </h3>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowImageModal(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X size={20} />
                </motion.button>
              </div>
              
              <ScrollArea className="p-4" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                  {imageFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="relative rounded-xl overflow-hidden bg-neutral-800 border border-white/10"
                    >
                      <img
                        src={file.data}
                        alt={file.name}
                        className="w-full h-[200px] object-contain bg-neutral-950"
                      />
                      <div className="p-3 border-t border-white/10">
                        <div className="text-sm text-white/80 truncate mb-1">
                          {file.name}
                        </div>
                        <div className="text-xs text-white/50">
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          removeFile(file.id)
                          if (imageFiles.length === 1) {
                            setShowImageModal(false)
                          }
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-red-400 hover:text-red-300 hover:bg-black/90 transition-colors"
                      >
                        <X size={14} />
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  )
}

export default InputArea
