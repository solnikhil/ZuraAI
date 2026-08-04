/**
 * TitleGenerationSettings — the "Chat Title Generation" settings card
 * (title model + sidebar reveal mode). Self-contained via `settings`/`onChange`.
 */

import React from 'react'

import { Card } from '@/components/ui/card'
import type { Settings } from '../../../contexts/SettingsContext'
import { getAvailableTitleModelOptions, getProviderDefinition } from '../../../providers'
import { SettingsSelect } from './SettingsSelect'

interface TitleGenerationSettingsProps {
  settings: Settings
  onChange: (changes: Partial<Settings>) => void
}

export function TitleGenerationSettings({
  settings,
  onChange,
}: TitleGenerationSettingsProps): React.ReactElement {
  const updateSettings = (changes: Partial<Settings>) => onChange(changes)

  const titleModelOptions = getAvailableTitleModelOptions(settings).map((option) => ({
    value: option.id,
    label: `${getProviderDefinition(option.provider).label} - ${option.displayName}`,
  }))

  if (
    settings.titleModel &&
    !titleModelOptions.some((model) => model.value === settings.titleModel)
  ) {
    titleModelOptions.push({ value: settings.titleModel, label: settings.titleModel })
  }

  return (
    <>
      <h3 className="appearance-group-heading">Chat Title Generation</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Title model</h3>
            <div className="settings-list-row__description">
              Model used for automatic chat titles across all configured providers
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={settings.titleModel || undefined}
              onValueChange={(value) => updateSettings({ titleModel: value })}
              options={titleModelOptions}
              placeholder="No models available"
              disabled={titleModelOptions.length === 0}
              aria-label="Title generation model"
            />
          </div>
        </div>

        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Sidebar title reveal</h3>
            <div className="settings-list-row__description">
              Show generated titles instantly or reveal them with a typewriter effect
            </div>
          </div>
          <div className="settings-list-row__control">
            <SettingsSelect
              value={settings.titleGenerationDisplayMode || 'instant'}
              onValueChange={(value) =>
                updateSettings({ titleGenerationDisplayMode: value as 'instant' | 'typewriter' })
              }
              options={[
                { value: 'instant', label: 'Instant' },
                { value: 'typewriter', label: 'Typewriter' },
              ]}
              aria-label="Sidebar title reveal mode"
            />
          </div>
        </div>
      </Card>
    </>
  )
}
