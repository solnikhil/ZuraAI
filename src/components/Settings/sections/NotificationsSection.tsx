import React, { useEffect, useState } from 'react'
import { Bell, Eye, EyeOff, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { EmailNotificationSettings } from '@/electron/types'
import { isSecureApiKeyPlaceholder } from '@/utils/secureApiKeys'

export interface NotificationsSectionProps {
  brevoApiKey: string
  emailNotifications: EmailNotificationSettings
  isSavingSecureSettings: boolean
  embedded?: boolean
  onChange: (changes: {
    brevoApiKey?: string
    emailNotifications?: EmailNotificationSettings
  }) => void
}

export function NotificationsSection({
  brevoApiKey,
  emailNotifications,
  isSavingSecureSettings,
  embedded = false,
  onChange,
}: NotificationsSectionProps): React.ReactElement {
  const [showApiKey, setShowApiKey] = useState(false)
  const [displayedApiKey, setDisplayedApiKey] = useState('')
  const [testStatus, setTestStatus] = useState('')
  const [isSendingTest, setIsSendingTest] = useState(false)

  useEffect(() => {
    setShowApiKey(false)
    setDisplayedApiKey('')

    if (isSecureApiKeyPlaceholder(brevoApiKey)) {
      setDisplayedApiKey('')
      return
    }

    setDisplayedApiKey(brevoApiKey)
  }, [brevoApiKey])

  const updateEmailNotifications = (changes: Partial<EmailNotificationSettings>) => {
    onChange({
      emailNotifications: {
        ...emailNotifications,
        ...changes,
      },
    })
  }

  const sendTestEmail = async () => {
    if (!window.emailNotifications?.sendTest || isSendingTest || isSavingSecureSettings) return
    setIsSendingTest(true)
    setTestStatus('Sending test email...')
    try {
      await window.emailNotifications.applySettings(emailNotifications)
      const result = await window.emailNotifications.sendTest()
      setTestStatus(result.ok ? 'Test email sent.' : result.error || 'Test email failed.')
    } catch (error) {
      setTestStatus(error instanceof Error ? error.message : 'Test email failed.')
    } finally {
      setIsSendingTest(false)
    }
  }

  const apiKeyValue = isSecureApiKeyPlaceholder(brevoApiKey) ? displayedApiKey : brevoApiKey

  const content = (
    <Card className={`settings-section-card provider-hub-base-card ${embedded ? '' : 'mt-4'}`}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <Bell size={18} />
            <span className="text-xl font-semibold leading-none text-foreground sm:text-2xl lg:text-[28px]">
              Email Notifications
            </span>
          </div>
          <Switch
            className="provider-hub-toggle"
            checked={emailNotifications.enabled}
            onCheckedChange={(enabled) => updateEmailNotifications({ enabled })}
            aria-label="Enable email notifications"
          />
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <DetailField
            label="Brevo API Key"
            description="Create a Brevo transactional email API key and save it here. The key is stored in secure storage."
            control={
              <div className="relative w-full">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyValue}
                  onChange={(event) => {
                    setDisplayedApiKey(event.target.value)
                    onChange({ brevoApiKey: event.target.value })
                  }}
                  placeholder={
                    isSecureApiKeyPlaceholder(brevoApiKey)
                      ? 'Brevo key stored securely. Enter a new key to replace it.'
                      : 'xkeysib-...'
                  }
                  className="border-border bg-secondary pr-10"
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((previous) => !previous)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                  aria-label={showApiKey ? 'Hide Brevo API key' : 'Show Brevo API key'}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            }
          />

          <DetailField
            label="Sender Name"
            description="Name shown in the From field."
            control={
              <input
                type="text"
                className="settings-text-input"
                value={emailNotifications.senderName}
                onChange={(event) => updateEmailNotifications({ senderName: event.target.value })}
                placeholder="ZuraAI"
              />
            }
          />

          <DetailField
            label="Sender Email"
            description="Use a verified Brevo sender. A domain-authenticated address gives better delivery."
            control={
              <input
                type="email"
                className="settings-text-input"
                value={emailNotifications.senderEmail}
                onChange={(event) => updateEmailNotifications({ senderEmail: event.target.value })}
                placeholder="reminders@example.com"
              />
            }
          />

          <DetailField
            label="Recipient Email"
            description="All reminder and lookout emails are sent to this address."
            control={
              <input
                type="email"
                className="settings-text-input"
                value={emailNotifications.recipientEmail}
                onChange={(event) =>
                  updateEmailNotifications({ recipientEmail: event.target.value })
                }
                placeholder="you@example.com"
              />
            }
          />

          <DetailField
            label="Test Email"
            description={
              isSavingSecureSettings
                ? 'Wait for the secure settings update before sending a test email.'
                : 'Sends a fixed test message using the saved Brevo key and current email settings.'
            }
            control={
              <div className="space-y-2 w-full">
                <Button
                  type="button"
                  className="gap-2"
                  onClick={sendTestEmail}
                  disabled={
                    isSavingSecureSettings || isSendingTest || !window.emailNotifications?.sendTest
                  }
                >
                  <Send size={14} />
                  {isSendingTest ? 'Sending...' : 'Send test email'}
                </Button>
                {testStatus && (
                  <div className="settings-inline-note" role="status" aria-live="polite">
                    {testStatus}
                  </div>
                )}
              </div>
            }
          />
        </div>
      </div>
    </Card>
  )

  if (embedded) {
    return <div className="extension-detail__embedded-section">{content}</div>
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Notifications</h2>
        <div className="page-subtitle">
          Send reminder and lookout emails through your own Brevo transactional email account.
        </div>
      </div>
      {content}
    </div>
  )
}

function DetailField({
  label,
  description,
  control,
}: {
  label: string
  description: React.ReactNode
  control: React.ReactNode
}): React.ReactElement {
  return (
    <div className="settings-list-row settings-list-row--field provider-hub-detail-field">
      <div className="settings-list-row__meta">
        <div className="settings-list-row__label">{label}</div>
        <div className="settings-list-row__description">{description}</div>
      </div>
      <div className="settings-list-row__control settings-list-row__control--stretch provider-hub-detail-field__control">
        {control}
      </div>
    </div>
  )
}

export default NotificationsSection
