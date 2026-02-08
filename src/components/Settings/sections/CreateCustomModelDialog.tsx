import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'

const CONTEXT_PRESETS = [0, 4000, 8000, 16000, 32000, 64000, 200000, 1000000, 2000000]

const EXTENDED_PARAMETER_OPTIONS = [
  'temperature',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
  'max_tokens',
]

interface CreateCustomModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (model: ConfiguredModel) => void
}

export function CreateCustomModelDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateCustomModelDialogProps): React.ReactElement {
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [modelType, setModelType] = useState<ConfiguredModel['modelType']>('chat')
  const [maxContextIndex, setMaxContextIndex] = useState(2)
  const [extendedParameters, setExtendedParameters] = useState<string[]>([])
  const [supportsToolCall, setSupportsToolCall] = useState(false)
  const [supportsVision, setSupportsVision] = useState(false)
  const [supportsDeepThinking, setSupportsDeepThinking] = useState(false)
  const [supportsWebSearch, setSupportsWebSearch] = useState(false)
  const [supportsImageGeneration, setSupportsImageGeneration] = useState(false)
  const [supportsVideoRecognition, setSupportsVideoRecognition] = useState(false)

  const maxContext = useMemo(() => CONTEXT_PRESETS[maxContextIndex] ?? 16000, [maxContextIndex])

  const reset = () => {
    setModelId('')
    setDisplayName('')
    setModelType('chat')
    setMaxContextIndex(2)
    setExtendedParameters([])
    setSupportsToolCall(false)
    setSupportsVision(false)
    setSupportsDeepThinking(false)
    setSupportsWebSearch(false)
    setSupportsImageGeneration(false)
    setSupportsVideoRecognition(false)
  }

  const toggleExtendedParameter = (name: string, checked: boolean) => {
    if (checked) {
      setExtendedParameters((previous) => (previous.includes(name) ? previous : [...previous, name]))
      return
    }
    setExtendedParameters((previous) => previous.filter((item) => item !== name))
  }

  const handleCreate = () => {
    const normalizedId = modelId.trim()
    if (!normalizedId) return

    onCreate({
      code: normalizedId,
      displayName: displayName.trim() || normalizedId,
      maxContext,
      modelType,
      extendedParameters,
      supportsToolCall,
      supportsVision,
      supportsDeepThinking,
      supportsWebSearch,
      supportsImageGeneration,
      supportsVideoRecognition,
    })

    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="border-border bg-card p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Create Custom AI Model</DialogTitle>
          <DialogDescription>
            Add your own model profile and set capability flags.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            <FormRow
              label="* Model ID"
              description="This cannot be modified after creation and will be used as the model ID when calling AI."
              control={(
                <Input
                  id="custom-model-id"
                  placeholder="Please enter the model ID, e.g., gpt-4o or claude-3.5-sonnet"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="border-border bg-secondary"
                />
              )}
            />

            <FormRow
              label="Model Display Name"
              description="A friendly model name shown in model selectors."
              control={(
                <Input
                  id="custom-model-display-name"
                  placeholder="Please enter the display name of the model, e.g., ChatGPT, GPT-4"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="border-border bg-secondary"
                />
              )}
            />

            <FormRow
              label="Maximum Context"
              description="Set the maximum number of tokens supported by the model."
              control={(
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      id="custom-model-context"
                      type="range"
                      min={0}
                      max={CONTEXT_PRESETS.length - 1}
                      step={1}
                      value={maxContextIndex}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10)
                        setMaxContextIndex(Number.isFinite(parsed) ? parsed : 0)
                      }}
                      className="w-full"
                    />
                    <Input
                      type="number"
                      value={maxContext}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10)
                        if (!Number.isFinite(parsed)) return
                        const closestIndex = CONTEXT_PRESETS.reduce((bestIndex, currentValue, currentIndex) => {
                          const bestDistance = Math.abs(CONTEXT_PRESETS[bestIndex] - parsed)
                          const currentDistance = Math.abs(currentValue - parsed)
                          return currentDistance < bestDistance ? currentIndex : bestIndex
                        }, 0)
                        setMaxContextIndex(closestIndex)
                      }}
                      className="w-24 border-border bg-secondary"
                    />
                  </div>
                  <div className="grid grid-cols-9 gap-2 text-xs text-muted-foreground">
                    {CONTEXT_PRESETS.map((value) => (
                      <span key={value} className="text-center">
                        {value >= 1000000 ? `${Math.round(value / 1000000)}M` : value === 0 ? '0' : `${Math.round(value / 1000)}K`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            />

            <FormRow
              label="Extended Parameters"
              description="Choose extended parameters supported by the model. Incorrect configs may cause request failures."
              control={(
                <div className="space-y-2 rounded-md border border-border bg-secondary/50 p-3">
                  <p className="text-xs text-muted-foreground">Select extended parameters to enable</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {EXTENDED_PARAMETER_OPTIONS.map((parameter) => {
                      const checked = extendedParameters.includes(parameter)
                      return (
                        <label key={parameter} className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-sm">
                          <span>{parameter}</span>
                          <Switch
                            checked={checked}
                            onCheckedChange={(next) => toggleExtendedParameter(parameter, next)}
                            aria-label={`Toggle ${parameter}`}
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            />

            <CapabilityRow
              label="Support for Tool Calling"
              description="This configuration only enables the model capability flag for tools. Validate real support on the model itself."
              checked={supportsToolCall}
              onCheckedChange={setSupportsToolCall}
            />

            <CapabilityRow
              label="Support Vision"
              description="Enable image upload capability in the app. Visual recognition still depends on actual model support."
              checked={supportsVision}
              onCheckedChange={setSupportsVision}
            />

            <CapabilityRow
              label="Support Deep Thinking"
              description="Enable deep thinking mode flags. Actual deep reasoning depends on the model itself."
              checked={supportsDeepThinking}
              onCheckedChange={setSupportsDeepThinking}
            />

            <CapabilityRow
              label="Supports Web Search"
              description="Enable built-in web search capability flags for this model profile."
              checked={supportsWebSearch}
              onCheckedChange={setSupportsWebSearch}
            />

            <CapabilityRow
              label="Supports Image Generation"
              description="Enable image generation capability flags for this model profile."
              checked={supportsImageGeneration}
              onCheckedChange={setSupportsImageGeneration}
            />

            <CapabilityRow
              label="Supports Video Recognition"
              description="Enable video recognition capability flags for this model profile."
              checked={supportsVideoRecognition}
              onCheckedChange={setSupportsVideoRecognition}
            />

            <FormRow
              label="Model Type"
              description="Different model types have distinct use cases and capabilities."
              control={(
                <>
                  <Label htmlFor="custom-model-type" className="sr-only">Model Type</Label>
                  <select
                    id="custom-model-type"
                    value={modelType}
                    onChange={(e) => setModelType(e.target.value as ConfiguredModel['modelType'])}
                    className="h-10 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                  >
                    <option value="chat">Chat</option>
                    <option value="reasoning">Reasoning</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="embedding">Embedding</option>
                    <option value="other">Other</option>
                  </select>
                </>
              )}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!modelId.trim()}>Add Model</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FormRow({
  label,
  description,
  control,
}: {
  label: string
  description: string
  control: React.ReactNode
}): React.ReactElement {
  return (
    <div className="grid gap-3 border-b border-border/60 pb-5 md:grid-cols-[180px_1fr] md:items-start">
      <div className="pt-2 text-sm font-medium text-foreground">{label}</div>
      <div className="space-y-2">
        {control}
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function CapabilityRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.ReactElement {
  return (
    <div className="grid gap-3 border-b border-border/60 pb-5 md:grid-cols-[180px_1fr] md:items-start">
      <div className="pt-1 text-sm font-medium text-foreground">{label}</div>
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2">
          <span className="text-sm text-foreground">Enable</span>
          <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default CreateCustomModelDialog
