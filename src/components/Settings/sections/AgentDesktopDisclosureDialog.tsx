import React, { useCallback, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

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

/**
 * Each shared resource a Windows Virtual Desktop does NOT isolate. All Virtual
 * Desktops belonging to the same Windows user share these surfaces, which is
 * why an Agent Desktop is a workspace-separation feature, not a sandbox.
 *
 * Requirement 12.1: the disclosure must state that a Virtual Desktop is not an
 * isolation boundary and that it shares the filesystem, registry, clipboard,
 * network, and Input_Session with the same Windows user.
 */
const SHARED_RESOURCES: ReadonlyArray<{ label: string; detail: string }> = [
  {
    label: 'Filesystem',
    detail: 'The agent can read and write the same files and folders you can.',
  },
  {
    label: 'Registry',
    detail: 'Windows registry changes apply to your whole user account.',
  },
  {
    label: 'Clipboard',
    detail: 'Copied text and data are shared across every desktop.',
  },
  {
    label: 'Network',
    detail: 'The agent uses your network identity, sessions, and credentials.',
  },
  {
    label: 'Input session',
    detail: 'A single Windows input session is shared by all Virtual Desktops.',
  },
]

export interface AgentDesktopDisclosureDialogProps {
  /** Whether the disclosure dialog is visible. Controlled by the parent. */
  open: boolean
  /**
   * Called when the user explicitly acknowledges the disclosure. Only this
   * action may gate enabling the Agent Desktop skill (Req 12.2).
   */
  onAcknowledge: () => void
  /**
   * Called when the user dismisses or declines the disclosure (Cancel button,
   * Escape key, or any non-acknowledging close). Must NOT enable anything.
   */
  onCancel: () => void
}

/**
 * "Not a sandbox" security disclosure for the Agent Desktop skill.
 *
 * A self-contained, reusable shadcn `AlertDialog`. The parent owns gating: the
 * skill must stay disabled until `onAcknowledge` fires, and any dismiss/decline
 * path routes to `onCancel` so no capability is enabled (Req 12.1, 12.2).
 */
export function AgentDesktopDisclosureDialog({
  open,
  onAcknowledge,
  onCancel,
}: AgentDesktopDisclosureDialogProps): React.ReactElement {
  // Guard so the acknowledge path does not also fire `onCancel` when the
  // dialog closes (AlertDialogAction triggers `onOpenChange(false)` too).
  const acknowledgedRef = useRef(false)

  const handleAcknowledge = useCallback(() => {
    acknowledgedRef.current = true
    onAcknowledge()
  }, [onAcknowledge])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        acknowledgedRef.current = false
        return
      }
      // Closing without an explicit acknowledgement is a decline/dismiss.
      if (acknowledgedRef.current) {
        acknowledgedRef.current = false
        return
      }
      onCancel()
    },
    [onCancel]
  )

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Separate desktop control is not a sandbox
          </AlertDialogTitle>
          <AlertDialogDescription>
            A Windows Virtual Desktop is not an isolation boundary. It only
            separates where windows appear &mdash; it does not contain what the
            agent can reach. Everything below is shared with the same Windows
            user, so the agent has the same access you do.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-2 text-sm">
          {SHARED_RESOURCES.map((resource) => (
            <li
              key={resource.label}
              className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2"
            >
              <span className="font-medium text-foreground">
                {resource.label}
              </span>
              <span className="text-muted-foreground"> &mdash; {resource.detail}</span>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground">
          Approvals, the kill switch, the per-session action cap, and
          window-targeting limits are the real safeguards. Do not rely on Agent
          Desktop to contain dangerous or destructive tasks. Enable it only if
          you understand and accept these risks.
        </p>

        <AlertDialogFooter>
          {/* Decline/dismiss is handled centrally in `handleOpenChange` so the
              Cancel button, Escape key, and overlay click all route through one
              path exactly once and never enable anything (Req 12.2). */}
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleAcknowledge}>
            I understand, enable separate desktop control
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default AgentDesktopDisclosureDialog
