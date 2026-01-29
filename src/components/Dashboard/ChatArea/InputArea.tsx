/**
 * InputArea - KokonutUI-inspired AI Prompt Input
 * Handles text input, file attachment triggers, and submit
 * 
 * Based on: https://kokonutui.com/docs/components/ai-prompt
 *           https://kokonutui.com/docs/components/ai-input-search
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Paperclip, Globe, Image, X, SendHorizonal, Square } from 'lucide-react'
import ModelSelector from '../ModelSelector/index'
import { useSettings } from '../../../contexts/SettingsContext'
import { processFiles, type AttachedFile } from './FileUploadHandler'
import { PastedContentChunk } from './PastedContentChunk'
import type { PastedContentChunk as PastedContentChunkType } from './types'
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

export interface InputAreaProps {
  input: string
  setInput: (value: string) => void
  onSend: () => void
  onStop?: () => void
  isLoading: boolean
  attachedFiles: AttachedFile[]
  onFilesChange: (files: AttachedFile[]) => void
  pastedChunks?: PastedContentChunkType[]
  onChunkEdit?: (chunk: PastedContentChunkType) => void
  onChunkDelete?: (id: string) => void
  onChunkCreate?: (content: string) => void
  onError?: (message: string) => void
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
  pastedChunks = [],
  onChunkEdit,
  onChunkDelete,
  onChunkCreate,
  onError
}: InputAreaProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [showImageModal, setShowImageModal] = React.useState(false)
  const [isFocused, setIsFocused] = React.useState(false)
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 52,
    maxHeight: 200,
  })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { settings, updateSettings } = useSettings()

  const imageFiles = attachedFiles.filter(f => f.type === 'image')

  // Web search is enabled when webSearchEnabled is true
  const showSearch = settings.webSearchEnabled

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && (input.trim() || attachedFiles.length > 0 || pastedChunks.length > 0)) {
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

  const PASTE_THRESHOLD = 250

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

    const pastedText = event.clipboardData.getData('text')
    if (pastedText.length > PASTE_THRESHOLD && onChunkCreate) {
      event.preventDefault()
      onChunkCreate(pastedText)
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

  const toggleSearch = () => {
    updateSettings({ 
      webSearchEnabled: !settings.webSearchEnabled,
      deepResearchEnabled: false // Always disable deep research
    })
  }

  const handleContainerClick = () => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const canSend = !isLoading && (input.trim() || attachedFiles.length > 0 || pastedChunks.length > 0)
  const showAttachmentBanner = attachedFiles.length > 0

  return (
    <TooltipProvider>
      <div
        className="w-full py-4"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Wider container - max-w-2xl = 672px */}
        <div className="relative max-w-2xl w-full mx-auto">
          {/* Pasted Content Chunks */}
          <AnimatePresence>
            {pastedChunks.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mb-2 flex flex-col gap-1.5"
              >
                {pastedChunks.map(chunk => (
                  <PastedContentChunk
                    key={chunk.id}
                    id={chunk.id}
                    content={chunk.content}
                    charCount={chunk.charCount}
                    onEdit={() => onChunkEdit?.(chunk)}
                    onDelete={() => onChunkDelete?.(chunk.id)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

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
                      className="gap-1 pr-1 bg-white/5 hover:bg-white/10 transition-colors"
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

          {/* Main Input Container - unified background */}
          <motion.div
            role="textbox"
            tabIndex={0}
            aria-label="Chat input container"
            initial={false}
            animate={{
              boxShadow: isFocused 
                ? "0 0 0 1px rgba(255, 255, 255, 0.16)" 
                : "0 0 0 1px rgba(255, 255, 255, 0.06)"
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              "--chat-input-surface-rgb": "255 255 255",
            } as React.CSSProperties}
            className={cn(
              "relative flex flex-col rounded-2xl w-full text-left cursor-text overflow-hidden bg-[rgb(var(--chat-input-surface-rgb)/0.05)] p-1.5",
              showAttachmentBanner ? "pt-3" : "pt-2",
              isDragging && "ring-2 ring-sky-400"
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
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold text-white/80">
                      AA
                    </span>
                    <span className="text-white/90 tracking-tighter">is free this weekend!</span>
                  </div>
                  <span className="text-white/70 tracking-tighter">Ship Now!</span>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="overflow-y-auto max-h-[200px]">
              <Textarea
                ref={textareaRef}
                value={input}
                placeholder={isDragging ? "Drop files here..." : "What can I do for you?"}
                className={cn(
                  "w-full rounded-xl rounded-b-none px-4 py-3.5 border-none resize-none focus-visible:ring-0 leading-[1.4] shadow-none",
                  "bg-[rgb(var(--chat-input-surface-rgb)/0.03)] backdrop-blur-sm",
                  "text-white/80",
                  "placeholder:text-white/50",
                  "transition-colors duration-200"
                )}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onChange={(e) => {
                  setInput(e.target.value)
                  adjustHeight()
                }}
                disabled={isLoading}
              />
            </div>

            {/* Bottom Controls Bar - same background as container */}
            <div className="h-12 rounded-b-xl relative bg-transparent">
              {/* Left side controls */}
              <div className="absolute left-3 bottom-3 flex items-center gap-1.5">
                {/* Model Selector */}
                <ModelSelector minimal={true} />

                <div className="mx-1 h-4 w-px bg-white/10" />

                {/* Web Search Toggle - KokonutUI style */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSearch()
                  }}
                  className={cn(
                    "rounded-full transition-all flex items-center gap-2 px-2 py-1 h-8 cursor-pointer",
                    showSearch
                      ? "bg-sky-500/15 text-sky-400"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  )}
                >
                  <div className="w-4 h-4 flex items-center justify-center shrink-0">
                    <motion.div
                      animate={{
                        rotate: showSearch ? 180 : 0,
                        scale: showSearch ? 1.1 : 1,
                      }}
                      whileHover={{
                        rotate: showSearch ? 180 : 15,
                        scale: 1.1,
                        transition: {
                          type: "spring",
                          stiffness: 300,
                          damping: 10,
                        },
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 25,
                      }}
                    >
                      <Globe
                        className={cn(
                          "w-4 h-4",
                          showSearch ? "text-sky-400" : "text-inherit"
                        )}
                      />
                    </motion.div>
                  </div>
                  <AnimatePresence>
                    {showSearch && (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm overflow-hidden whitespace-nowrap text-sky-400 shrink-0 pr-1"
                      >
                        Search
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

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
                            className="h-8 px-2 gap-1 flex items-center text-sky-400 hover:text-sky-300 rounded-lg transition-colors"
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

              {/* Right side controls - Attach + Send */}
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                {/* Attach file button - no background when no files */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept="image/*,.pdf,.txt,.doc,.docx,.csv,.json,.xml"
                  className="hidden"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                      <motion.label
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={cn(
                          "cursor-pointer rounded-lg p-2 transition-colors duration-150 hover:bg-white/10",
                          attachedFiles.length > 0
                            ? "text-white/90"
                            : "text-white/60 hover:text-white/80"
                        )}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          fileInputRef.current?.click()
                        }}
                    >
                      <Paperclip className="w-4 h-4" />
                    </motion.label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="rounded-full">
                    {attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'Attach files'}
                  </TooltipContent>
                </Tooltip>

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
                            ? "text-white/90 hover:bg-white/10"
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
