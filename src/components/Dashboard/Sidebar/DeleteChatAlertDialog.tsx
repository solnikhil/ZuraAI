import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEffect, useRef } from 'react'
import { isMacOSRuntime } from '../../../utils/platform'

interface DeleteChatAlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export default function DeleteChatAlertDialog({
  open,
  onOpenChange,
  onConfirm,
}: DeleteChatAlertDialogProps) {
  const nativeDialogOpenRef = useRef(false)
  const useNativeMacDialog = isMacOSRuntime() && Boolean(window.nativeDialog?.confirmDeleteChat)

  useEffect(() => {
    if (!open || !useNativeMacDialog || nativeDialogOpenRef.current) {
      return
    }

    nativeDialogOpenRef.current = true

    void window.nativeDialog
      .confirmDeleteChat()
      .then((confirmed) => {
        if (confirmed) {
          onConfirm()
        }
      })
      .finally(() => {
        nativeDialogOpenRef.current = false
        onOpenChange(false)
      })
  }, [onConfirm, onOpenChange, open, useNativeMacDialog])

  if (useNativeMacDialog) {
    return null
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text-primary)] shadow-none"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[var(--theme-text-primary)]">Delete chat?</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--theme-text-muted)]">
            This action cannot be undone. This will permanently delete this conversation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[var(--theme-border)] bg-transparent text-[var(--theme-text-primary)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
