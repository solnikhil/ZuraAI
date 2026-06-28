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

interface DeleteFolderAlertDialogProps {
  open: boolean
  folderName: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export default function DeleteFolderAlertDialog({
  open,
  folderName,
  onOpenChange,
  onConfirm,
}: DeleteFolderAlertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text-primary)] shadow-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[var(--theme-text-primary)]">
            Delete folder?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--theme-text-muted)]">
            Chats in {folderName || 'this folder'} will move back to Recents. The chats will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[var(--theme-border)] bg-transparent text-[var(--theme-text-primary)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text-primary)]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
