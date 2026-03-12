/**
 * Inline attachment rail for the chat composer.
 */

import * as React from 'react'
import { FileText, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  formatFileSize,
  splitAttachedFiles,
  type AttachedFile,
} from './attachmentUtils'

interface ComposerAttachmentsProps {
  files: AttachedFile[]
  onRemove: (fileId: string) => void
}

function ImagePreviewCard({
  file,
  onRemove,
  onPreview,
}: {
  file: AttachedFile
  onRemove: (fileId: string) => void
  onPreview: (file: AttachedFile) => void
}) {
  return (
    <div className="group relative shrink-0 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)]">
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/80"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => onPreview(file)}
        className="relative block h-[76px] w-[76px] overflow-hidden bg-[color-mix(in_srgb,var(--theme-background)_78%,black_22%)] text-left"
      >
        <img
          src={file.data}
          alt={file.name}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      </button>
    </div>
  )
}

function FileAttachmentChip({ file, onRemove }: { file: AttachedFile; onRemove: (fileId: string) => void }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] px-3 py-1.5 text-xs text-[var(--theme-text-secondary)]">
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{file.name}</span>
      <span className="text-[var(--theme-text-muted)]">{formatFileSize(file.size)}</span>
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--theme-text-muted)] transition hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-primary)]"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function ComposerAttachments({ files, onRemove }: ComposerAttachmentsProps) {
  const [previewFile, setPreviewFile] = React.useState<AttachedFile | null>(null)
  const { images, documents } = React.useMemo(() => splitAttachedFiles(files), [files])

  if (files.length === 0) return null

  return (
    <>
      <div className="mx-2 mb-2.5 space-y-2">
        {images.length > 0 && (
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-full gap-2">
              {images.map((file) => (
                <ImagePreviewCard
                  key={file.id}
                  file={file}
                  onRemove={onRemove}
                  onPreview={setPreviewFile}
                />
              ))}
            </div>
          </div>
        )}

        {documents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {documents.map((file) => (
              <FileAttachmentChip
                key={file.id}
                file={file}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(previewFile)} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-3xl overflow-hidden rounded-[28px] border-[var(--theme-border)] bg-[var(--theme-surface)] p-0">
          {previewFile && (
            <>
              <DialogHeader className="border-b border-[var(--theme-border)] px-6 py-4 text-left">
                <DialogTitle className="truncate text-base text-[var(--theme-text-primary)]">
                  {previewFile.name}
                </DialogTitle>
                <DialogDescription className="text-[var(--theme-text-muted)]">
                  {formatFileSize(previewFile.size)}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-auto bg-[color-mix(in_srgb,var(--theme-background)_82%,black_18%)] p-4">
                <img
                  src={previewFile.data}
                  alt={previewFile.name}
                  className="mx-auto max-h-[62vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ComposerAttachments
