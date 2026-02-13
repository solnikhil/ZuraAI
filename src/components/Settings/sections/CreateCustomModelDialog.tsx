import React, { useEffect, useMemo, useState } from 'react'
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
  /** When provided, dialog operates in edit mode: prefill form, code read-only, Save instead of Add */
  initialModel?: ConfiguredModel
  /** Called when saving in edit mode. If omitted, onCreate is used for both create and edit. */
  onUpdate?: (model: ConfiguredModel) => void
}

export function CreateCustomModelDialog({
  open,
  onOpenChange,
  onCreate,
  initialModel,
  onUpdate,
}: CreateCustomModelDialogProps): React.ReactElement {
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [modelType, setModelType] = useState<ConfiguredModel['modelType']>('chat')
  const [maxContext, setMaxContext] = useState(16000)
  const [extendedParameters, setExtendedParameters] = useState<string[]>([])
  const [supportsToolCall, setSupportsToolCall] = useState(false)
  const [supportsVision, setSupportsVision] = useState(false)
  const [supportsDeepThinking, setSupportsDeepThinking] = useState(false)
  const [supportsWebSearch, setSupportsWebSearch] = useState(false)
  const [supportsImageGeneration, setSupportsImageGeneration] = useState(false)
  const [supportsVideoRecognition, setSupportsVideoRecognition] = useState(false)

  const isEditMode = Boolean(initialModel)

  /** Index of closest preset for slider thumb position (0..8) */
  const maxContextSliderIndex = useMemo(() => {
    const idx = CONTEXT_PRESETS.indexOf(maxContext)
    if (idx >= 0) return idx
    return CONTEXT_PRESETS.reduce(
      (best, val, i) =>
        Math.abs(val - maxContext) < Math.abs(CONTEXT_PRESETS[best] - maxContext) ? i : best,
      0
    )
  }, [maxContext])

  useEffect(() => {
    if (open && initialModel) {
      setModelId(initialModel.code)
      setDisplayName(initialModel.displayName || initialModel.code)
      setModelType(initialModel.modelType ?? 'chat')
      setMaxContext(initialModel.maxContext ?? 16000)
      setExtendedParameters(initialModel.extendedParameters ?? [])
      setSupportsToolCall(initialModel.supportsToolCall ?? false)
      setSupportsVision(initialModel.supportsVision ?? false)
      setSupportsDeepThinking(initialModel.supportsDeepThinking ?? false)
      setSupportsWebSearch(initialModel.supportsWebSearch ?? false)
      setSupportsImageGeneration(initialModel.supportsImageGeneration ?? false)
      setSupportsVideoRecognition(initialModel.supportsVideoRecognition ?? false)
    }
  }, [open, initialModel])

  const reset = () => {
    setModelId('')
    setDisplayName('')
    setModelType('chat')
    setMaxContext(16000)
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

  const handleSubmit = () => {
    const normalizedId = modelId.trim()
    if (!normalizedId) return

    const model: ConfiguredModel = {
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
      ...(isEditMode && initialModel && { enabled: initialModel.enabled }),
    }

    if (isEditMode && onUpdate) {
      onUpdate(model)
    } else {
      onCreate(model)
    }

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
          <DialogTitle>{isEditMode ? 'Edit Model' : 'Create Custom AI Model'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update model parameters and capability flags.'
              : 'Add your own model profile and set capability flags.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            <FormRow
              label="* Model ID"
              description={isEditMode ? 'Model ID cannot be changed.' : 'This cannot be modified after creation and will be used as the model ID when calling AI.'}
              control={(
                <Input
                  id="custom-model-id"
                  placeholder="Please enter the model ID, e.g., gpt-4o or claude-3.5-sonnet"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  readOnly={isEditMode}
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
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        id="custom-model-context"
                        type="range"
                        min={0}
                        max={CONTEXT_PRESETS.length - 1}
                        step={1}
                        value={maxContextSliderIndex}
                        onChange={(e) => {
                          const idx = Number.parseInt(e.target.value, 10)
                          if (Number.isFinite(idx) && idx >= 0 && idx < CONTEXT_PRESETS.length) {
                            setMaxContext(CONTEXT_PRESETS[idx])
                          }
                        }}
                        className="w-full"
                      />
                      <div className="grid grid-cols-9 gap-2 text-xs text-muted-foreground">
                        {CONTEXT_PRESETS.map((value) => (
                          <span key={value} className="text-center">
                            {value >= 1000000 ? `${Math.round(value / 1000000)}M` : value === 0 ? '0' : `${Math.round(value / 1000)}K`}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={10_000_000}
                      value={maxContext}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          setMaxContext(0)
                          return
                        }
                        const parsed = Number.parseInt(raw, 10)
                        if (!Number.isFinite(parsed) || parsed < 0) return
                        setMaxContext(Math.min(parsed, 10_000_000))
                      }}
                      className="w-24 shrink-0 border-border bg-secondary"
                    />
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
          <Button onClick={handleSubmit} disabled={!modelId.trim()}>
            {isEditMode ? 'Save' : 'Add Model'}
          </Button>
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
