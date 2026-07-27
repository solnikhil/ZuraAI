import type { ReactElement, ReactNode } from 'react'

interface ProviderDetailFieldProps {
  label: string
  description: string
  control: ReactNode
}

export function ProviderDetailField({
  label,
  description,
  control,
}: ProviderDetailFieldProps): ReactElement {
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
