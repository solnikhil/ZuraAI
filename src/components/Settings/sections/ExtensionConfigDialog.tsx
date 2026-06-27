import React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { OverlaySettings } from '@/contexts/SettingsConfigContext'
import type { Settings } from '@/contexts/SettingsContext'
import type { EmailNotificationSettings } from '@/electron/types'
import type { SkillsSettings } from '@/skills'
import { ExtensionDetailSection } from './ExtensionDetailSection'
import type { CatalogExtensionId } from './extensionCatalog'

export interface ExtensionConfigDialogProps {
  open: boolean
  extensionId: CatalogExtensionId | null
  skills: SkillsSettings
  overlay?: OverlaySettings
  settings?: Settings
  codeExecutionAutoApprove: boolean
  terminalAutoApprove: boolean
  computerUseAutoApprove: boolean
  brevoApiKey?: string
  emailNotifications?: EmailNotificationSettings
  hasUnsavedChanges?: boolean
  initialPanel?: 'notifications'
  isEnabled: (extensionId: CatalogExtensionId) => boolean
  setEnabled: (extensionId: CatalogExtensionId, enabled: boolean) => void
  onChange: (changes: {
    skills?: SkillsSettings
    overlay?: OverlaySettings
    codeExecutionAutoApprove?: boolean
    terminalAutoApprove?: boolean
    computerUseAutoApprove?: boolean
    memoryModel?: string
    brevoApiKey?: string
    emailNotifications?: EmailNotificationSettings
  }) => void
  onOpenChange: (open: boolean) => void
}

export function ExtensionConfigDialog({
  open,
  extensionId,
  skills,
  overlay,
  settings,
  codeExecutionAutoApprove,
  terminalAutoApprove,
  computerUseAutoApprove,
  brevoApiKey,
  emailNotifications,
  hasUnsavedChanges,
  initialPanel,
  isEnabled,
  setEnabled,
  onChange,
  onOpenChange,
}: ExtensionConfigDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="extension-config-dialog"
        showCloseButton
        overlayClassName="catalog-modal-backdrop"
        aria-describedby={undefined}
      >
        {extensionId ? (
          <div className="extension-config-dialog__body">
            <ExtensionDetailSection
              extensionId={extensionId}
              skills={skills}
              overlay={overlay}
              settings={settings}
              codeExecutionAutoApprove={codeExecutionAutoApprove}
              terminalAutoApprove={terminalAutoApprove}
              computerUseAutoApprove={computerUseAutoApprove}
              brevoApiKey={brevoApiKey}
              emailNotifications={emailNotifications}
              hasUnsavedChanges={hasUnsavedChanges}
              initialPanel={initialPanel}
              isEnabled={isEnabled}
              setEnabled={setEnabled}
              onChange={onChange}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default ExtensionConfigDialog