import React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SettingsSelectProps {
  value?: string
  onValueChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function SettingsSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: SettingsSelectProps): React.ReactElement {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={[
          'setting-input-scira min-w-[140px] justify-between gap-3',
          disabled ? 'opacity-50' : '',
          className ?? '',
        ].join(' ')}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
