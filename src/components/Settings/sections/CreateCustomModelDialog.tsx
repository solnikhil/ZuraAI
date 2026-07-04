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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ProviderId } from '@/providers/providerTypes'
import {
  fetchOpenRouterModels,
  mapOpenRouterModelToConfiguredModel,
} from '@/services/openrouterModels'
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
  provider?: ProviderId
  providerApiKey?: string
  /** When provided, dialog operates in edit mode: prefill form, code read-only, Save instead of Add */
  initialModel?: ConfiguredModel
  /** Called when saving in edit mode. If omitted, onCreate is used for both create and edit. */
  onUpdate?: (model: ConfiguredModel) => void
}

export function CreateCustomModelDialog({
  open,
  onOpenChange,
  onCreate,
  provider,
  providerApiKey,
  initialModel,
  onUpdate,
}: CreateCustomModelDialogProps): React.ReactElement {
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [modelType, setModelType] = useState<ConfiguredModel['modelType']>('chat')
  const [maxContext, setMaxContext] = useState(16000)
  const [extendedParameters, setExtendedParameters] = useState<string[]>([])
  const [inputModalities, setInputModalities] = useState<string[]>([])
  const [outputModalities, setOutputModalities] = useState<string[]>([])
  const [supportsToolCall, setSupportsToolCall] = useState(false)
  const [supportsVision, setSupportsVision] = useState(false)
  const [supportsDeepThinking, setSupportsDeepThinking] = useState(false)
  const [supportsWebSearch, setSupportsWebSearch] = useState(false)
  const [supportsImageGeneration, setSupportsImageGeneration] = useState(false)
  const [supportsVideoRecognition, setSupportsVideoRecognition] = useState(false)
  const [autoFillState, setAutoFillState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )
  const [autoFillMessage, setAutoFillMessage] = useState('')

  const isEditMode = Boolean(initialModel)
  const enabledCapabilitiesCount = [
    supportsToolCall,
    supportsVision,
    supportsDeepThinking,
    supportsWebSearch,
    supportsImageGeneration,
    supportsVideoRecognition,
  ].filter(Boolean).length

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
      setDescription(initialModel.description ?? '')
      setModelType(initialModel.modelType ?? 'chat')
      setMaxContext(initialModel.maxContext ?? 16000)
      setExtendedParameters(initialModel.extendedParameters ?? [])
      setInputModalities(initialModel.inputModalities ?? [])
      setOutputModalities(initialModel.outputModalities ?? [])
      setSupportsToolCall(initialModel.supportsToolCall ?? false)
      setSupportsVision(initialModel.supportsVision ?? false)
      setSupportsDeepThinking(initialModel.supportsDeepThinking ?? false)
      setSupportsWebSearch(initialModel.supportsWebSearch ?? false)
      setSupportsImageGeneration(initialModel.supportsImageGeneration ?? false)
      setSupportsVideoRecognition(initialModel.supportsVideoRecognition ?? false)
      setAutoFillState('idle')
      setAutoFillMessage('')
    }
  }, [open, initialModel])

  const reset = () => {
    setModelId('')
    setDisplayName('')
    setDescription('')
    setModelType('chat')
    setMaxContext(16000)
    setExtendedParameters([])
    setInputModalities([])
    setOutputModalities([])
    setSupportsToolCall(false)
    setSupportsVision(false)
    setSupportsDeepThinking(false)
    setSupportsWebSearch(false)
    setSupportsImageGeneration(false)
    setSupportsVideoRecognition(false)
    setAutoFillState('idle')
    setAutoFillMessage('')
  }

  const toggleExtendedParameter = (name: string, checked: boolean) => {
    if (checked) {
      setExtendedParameters((previous) =>
        previous.includes(name) ? previous : [...previous, name]
      )
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
      description: description.trim() || undefined,
      maxContext,
      modelType,
      extendedParameters,
      inputModalities,
      outputModalities,
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

  const maybeAutoFillOpenRouterModel = async (rawModelId: string) => {
    if (provider !== 'openrouter' || isEditMode) return

    const normalizedId = rawModelId.trim()
    if (!normalizedId) {
      setAutoFillState('idle')
      setAutoFillMessage('')
      return
    }

    setAutoFillState('loading')
    setAutoFillMessage('Fetching model spec from OpenRouter...')

    try {
      const models = await fetchOpenRouterModels(providerApiKey)
      const matchedModel = models.find((model) => model.id === normalizedId)

      if (!matchedModel) {
        setAutoFillState('error')
        setAutoFillMessage('Model not found in the OpenRouter catalog.')
        return
      }

      const mappedModel = mapOpenRouterModelToConfiguredModel(matchedModel)
      setDisplayName(mappedModel.displayName || normalizedId)
      setDescription(mappedModel.description ?? '')
      setModelType(mappedModel.modelType ?? 'chat')
      setMaxContext(mappedModel.maxContext ?? 16000)
      setExtendedParameters(mappedModel.extendedParameters ?? [])
      setInputModalities(mappedModel.inputModalities ?? [])
      setOutputModalities(mappedModel.outputModalities ?? [])
      setSupportsToolCall(mappedModel.supportsToolCall ?? false)
      setSupportsVision(mappedModel.supportsVision ?? false)
      setSupportsDeepThinking(mappedModel.supportsDeepThinking ?? false)
      setSupportsWebSearch(mappedModel.supportsWebSearch ?? false)
      setSupportsImageGeneration(mappedModel.supportsImageGeneration ?? false)
      setSupportsVideoRecognition(mappedModel.supportsVideoRecognition ?? false)
      setAutoFillState('success')
      setAutoFillMessage('Model spec loaded from OpenRouter.')
    } catch (error) {
      setAutoFillState('error')
      setAutoFillMessage(
        error instanceof Error ? error.message : 'Failed to fetch model spec from OpenRouter.'
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden border-border bg-card p-0 sm:max-w-[820px]">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <DialogTitle className="text-[1.05rem] tracking-[-0.01em]">
                {isEditMode ? 'Edit Model' : 'Create Custom AI Model'}
              </DialogTitle>
              <DialogDescription className="max-w-[56ch] leading-6">
                {isEditMode
                  ? 'Update model parameters and capability flags.'
                  : 'Add your own model profile and configure how this model behaves inside ZuraAI.'}
              </DialogDescription>
            </div>
            <div className="hidden shrink-0 rounded-full border border-border bg-secondary/70 px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
              {isEditMode ? 'Editing existing profile' : 'New custom profile'}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <MetaPill label="Type" value={modelType ?? 'chat'} />
            <MetaPill label="Context" value={formatContextValue(maxContext)} />
            <MetaPill label="Capabilities" value={`${enabledCapabilitiesCount} enabled`} />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-8">
            <SectionBlock
              title="Basics"
              description="Core identity and sizing for the model profile."
            >
              <FormRow
                label="* Model ID"
                description={
                  isEditMode
                    ? 'Model ID cannot be changed.'
                    : 'This cannot be modified after creation and will be used as the model ID when calling AI.'
                }
                control={
                  <Input
                    id="custom-model-id"
                    placeholder="Please enter the model ID, e.g., gpt-4o or claude-3.5-sonnet"
                    value={modelId}
                    onChange={(e) => {
                      setModelId(e.target.value)
                      if (provider === 'openrouter' && !isEditMode) {
                        setAutoFillState('idle')
                        setAutoFillMessage('Leave the field to auto-fill from OpenRouter.')
                      }
                    }}
                    onBlur={(e) => {
                      void maybeAutoFillOpenRouterModel(e.target.value)
                    }}
                    readOnly={isEditMode}
                    className="border-border bg-secondary"
                  />
                }
              />
              {provider === 'openrouter' && !isEditMode ? (
                <div className="px-4 pt-1 md:px-5">
                  <p
                    className={cn(
                      'text-xs leading-5',
                      autoFillState === 'error'
                        ? 'text-rose-300'
                        : autoFillState === 'success'
                          ? 'text-emerald-300'
                          : 'text-muted-foreground'
                    )}
                  >
                    {autoFillMessage ||
                      'Paste an OpenRouter model ID and tab out to auto-fill supported specs.'}
                  </p>
                </div>
              ) : null}

              <FormRow
                label="Model Display Name"
                description="A friendly model name shown in model selectors."
                control={
                  <Input
                    id="custom-model-display-name"
                    placeholder="Please enter the display name of the model, e.g., ChatGPT, GPT-4"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="border-border bg-secondary"
                  />
                }
              />

              <FormRow
                label="Maximum Context"
                description="Set the maximum number of tokens supported by the model."
                control={
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
                              {formatPresetLabel(value)}
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
                        className="w-28 shrink-0 border-border bg-secondary text-right"
                      />
                    </div>
                  </div>
                }
              />

              <FormRow
                label="Model Type"
                description="Different model types have distinct use cases and capabilities."
                control={
                  <>
                    <Label htmlFor="custom-model-type" className="sr-only">
                      Model Type
                    </Label>
                    <Select
                      value={modelType}
                      onValueChange={(value) => setModelType(value as ConfiguredModel['modelType'])}
                    >
                      <SelectTrigger
                        id="custom-model-type"
                        className="h-10 w-full border-border bg-secondary"
                        aria-label="Model Type"
                      >
                        <SelectValue placeholder="Select model type" />
                      </SelectTrigger>
                      <SelectContent className="settings-menu-surface">
                        <SelectItem value="chat">Chat</SelectItem>
                        <SelectItem value="reasoning">Reasoning</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="embedding">Embedding</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                }
              />
            </SectionBlock>

            <SectionBlock
              title="Behavior"
              description="Optional request parameters supported by this model profile."
            >
              <FormRow
                label="Extended Parameters"
                description="Choose extended parameters supported by the model. Incorrect configs may cause request failures."
                control={
                  <div className="space-y-3 rounded-xl border border-border bg-secondary/45 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      Select parameters to enable
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {EXTENDED_PARAMETER_OPTIONS.map((parameter) => {
                        const checked = extendedParameters.includes(parameter)
                        return (
                          <label
                            key={parameter}
                            className="flex items-center justify-between rounded-lg border border-border bg-background/20 px-3 py-2 text-sm transition hover:bg-background/30"
                          >
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
                }
              />
            </SectionBlock>

            <SectionBlock
              title="Capabilities"
              description="These flags control which product features this model can participate in."
            >
              <div className="grid gap-3">
                <CapabilityRow
                  label="Support for Tool Calling"
                  description="This only enables the tool-capability flag in the app. Validate actual tool support on the model itself."
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
                  description="Enable deep-thinking mode flags. Actual reasoning depth still depends on the model."
                  checked={supportsDeepThinking}
                  onCheckedChange={setSupportsDeepThinking}
                />

                <CapabilityRow
                  label="Supports Web Search"
                  description="Expose built-in web-search capability flags for this model profile."
                  checked={supportsWebSearch}
                  onCheckedChange={setSupportsWebSearch}
                />

                <CapabilityRow
                  label="Supports Image Generation"
                  description="Enable image-generation capability flags for this model profile."
                  checked={supportsImageGeneration}
                  onCheckedChange={setSupportsImageGeneration}
                />

                <CapabilityRow
                  label="Supports Video Recognition"
                  description="Enable video-recognition capability flags for this model profile."
                  checked={supportsVideoRecognition}
                  onCheckedChange={setSupportsVideoRecognition}
                />
              </div>
            </SectionBlock>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border bg-[linear-gradient(0deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Profiles affect model selection and feature gating only.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!modelId.trim()}>
              {isEditMode ? 'Save' : 'Add Model'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionBlock({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground/88">
          {title}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-secondary/18">
        {children}
      </div>
    </section>
  )
}

function MetaPill({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/85">{label}</span>
      <span>{value}</span>
    </span>
  )
}

function formatPresetLabel(value: number): string {
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`
  if (value === 0) return '0'
  return `${Math.round(value / 1000)}K`
}

function formatContextValue(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return `${value}`
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
    <div className="grid gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 md:grid-cols-[190px_1fr] md:gap-4 md:px-5">
      <div className="min-w-0 pt-1.5 text-sm font-medium text-foreground">{label}</div>
      <div className="min-w-0 space-y-2.5">
        {control}
        <p className="break-words text-xs leading-5 text-muted-foreground">{description}</p>
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
    <div className="grid gap-3 rounded-xl border border-border/70 bg-secondary/24 px-4 py-4 md:grid-cols-[190px_1fr] md:gap-4 md:px-5">
      <div className="min-w-0 pt-1 text-sm font-medium text-foreground">{label}</div>
      <div className="min-w-0 space-y-2">
        <div className="flex items-start justify-end">
          <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
        </div>
        <p
          className={cn(
            'break-words pr-2 text-xs leading-5',
            checked ? 'text-foreground/78' : 'text-muted-foreground'
          )}
        >
          {description}
        </p>
      </div>
    </div>
  )
}

export default CreateCustomModelDialog
