import type { ReactElement } from 'react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'

interface NotificationsSectionProps {
  notificationsEnabled: boolean
  nativeNotificationsEnabled: boolean
  toastDuration: number
  doNotDisturb: boolean
  onChange: (changes: {
    notificationsEnabled?: boolean
    nativeNotificationsEnabled?: boolean
    toastDuration?: number
    doNotDisturb?: boolean
  }) => void
}

function clampToastDuration(value: number): number {
  if (!Number.isFinite(value)) return 4000
  return Math.min(10000, Math.max(2000, Math.round(value)))
}

export function NotificationsSection({
  notificationsEnabled,
  nativeNotificationsEnabled,
  toastDuration,
  doNotDisturb,
  onChange,
}: NotificationsSectionProps): ReactElement {
  const clampedDuration = clampToastDuration(toastDuration)

  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">Notifications</h2>
        <div className="page-subtitle">Control toast, banner, and native alert behavior.</div>
      </div>

      <Card className="settings-section-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Enable notifications</h3>
            <div className="section-desc">Turns off all non-critical notifications when disabled.</div>
          </div>
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={(checked) => onChange({ notificationsEnabled: checked })}
            aria-label="Enable notifications"
          />
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Native desktop notifications</h3>
            <div className="section-desc">Show OS-level alerts for critical notifications while unfocused.</div>
          </div>
          <Switch
            checked={nativeNotificationsEnabled}
            onCheckedChange={(checked) => onChange({ nativeNotificationsEnabled: checked })}
            aria-label="Enable native desktop notifications"
          />
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Toast duration</h3>
            <div className="section-desc">Set how long toast notifications stay visible (2000-10000 ms).</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range"
              min={2000}
              max={10000}
              step={100}
              value={clampedDuration}
              onChange={(event) => onChange({ toastDuration: clampToastDuration(Number(event.target.value)) })}
              style={{ flex: 1 }}
              aria-label="Toast duration in milliseconds"
            />
            <Input
              type="number"
              min={2000}
              max={10000}
              step={100}
              value={clampedDuration}
              onChange={(event) => onChange({ toastDuration: clampToastDuration(Number(event.target.value)) })}
              className="w-28"
              aria-label="Toast duration input"
            />
          </div>
        </div>
      </Card>

      <Card className="settings-section-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>Do not disturb</h3>
            <div className="section-desc">Suppress toast and banner rendering while still storing notifications.</div>
          </div>
          <Switch
            checked={doNotDisturb}
            onCheckedChange={(checked) => onChange({ doNotDisturb: checked })}
            aria-label="Enable do not disturb"
          />
        </div>
      </Card>
    </div>
  )
}

export default NotificationsSection
