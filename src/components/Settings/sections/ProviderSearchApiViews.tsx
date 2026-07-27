import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { ChevronLeft, Eye, EyeOff, MoreVertical, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SkillLogo } from '@/components/shared'
import { Switch } from '@/components/ui/switch'
import type { TavilySearchDepthPreference } from '@/contexts/SettingsConfigContext'
import { isSecureApiKeyPlaceholder } from '@/utils/secureApiKeys'
import { ProviderDetailField } from './ProviderDetailField'
import type { ProviderHubSectionProps } from './ProviderHubSection'

export type SearchApiKey = 'tavily' | 'onlinecompiler'
export type ProviderCatalogFilter = 'all' | 'needs-setup' | 'disabled' | 'active'

export interface SearchApiDefinition {
  key: SearchApiKey
  name: string
  description: string
  shortDescription?: string
  icon: ReactNode
  color?: string
  learnMoreUrl?: string
  apiKeyField?: 'tavilyApiKey' | 'onlineCompilerApiKey'
}

export const SEARCH_APIS: SearchApiDefinition[] = [
  {
    key: 'tavily',
    name: 'Tavily',
    description:
      'AI-optimized search API for the web_search tool. Best quality results with optional images.',
    shortDescription: 'AI-optimized search for web_search. Add a key for best results.',
    icon: <SkillLogo skill="tavily" size={18} />,
    color: '#4dabf7',
    learnMoreUrl: 'https://tavily.com',
    apiKeyField: 'tavilyApiKey',
  },
  {
    key: 'onlinecompiler',
    name: 'Code Execution API',
    description: 'Free code execution sandbox for the code_execution tool (1M requests/month).',
    shortDescription: 'Run code_execution with OnlineCompiler. Add a key for best results.',
    icon: <Terminal size={16} />,
    color: '#a78bfa',
    learnMoreUrl: 'https://onlinecompiler.io',
    apiKeyField: 'onlineCompilerApiKey',
  },
]

interface SearchApiSectionProps {
  apis: SearchApiDefinition[]
  filter: ProviderCatalogFilter
  selectedApi: SearchApiKey
  tavilyApiKey: string
  onlineCompilerApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  onCardClick: (api: SearchApiDefinition) => void
  onChange: ProviderHubSectionProps['onChange']
}

function getDepthSummary(preference: TavilySearchDepthPreference): string {
  switch (preference) {
    case 'auto':
      return 'Auto speed'
    case 'ultra-fast':
      return 'Lightning'
    case 'fast':
      return 'Fast'
    case 'basic':
      return 'Standard'
    case 'advanced':
      return 'Thorough'
    default:
      return 'Auto speed'
  }
}

export function SearchApiSection({
  apis,
  filter,
  selectedApi,
  tavilyApiKey,
  onlineCompilerApiKey,
  tavilySearchDepthPreference,
  onCardClick,
  onChange,
}: SearchApiSectionProps): ReactElement | null {
  const getApiKeyValue = (api: SearchApiDefinition): string => {
    if (api.apiKeyField === 'tavilyApiKey') return tavilyApiKey
    if (api.apiKeyField === 'onlineCompilerApiKey') return onlineCompilerApiKey
    return ''
  }

  const visibleApis = apis.filter((api) => {
    const hasKey = Boolean(api.apiKeyField && getApiKeyValue(api).trim())
    if (filter === 'needs-setup') return !hasKey
    if (filter === 'active') return hasKey
    if (filter === 'disabled') return false
    return true
  })
  if (visibleApis.length === 0) return null

  const configuredCount = visibleApis.filter((api) =>
    Boolean(api.apiKeyField && getApiKeyValue(api).trim())
  ).length

  return (
    <div className="provider-catalog" aria-label="Service APIs">
      <section className="provider-catalog-group">
        <div className="provider-catalog-group__header">
          <h3>Service APIs</h3>
        </div>
        <p className="provider-catalog-group__summary">
          {configuredCount}/{visibleApis.length} configured
        </p>
        <div className="provider-catalog-group__grid provider-catalog-group__grid--featured">
          {visibleApis.map((api) => {
            const hasKey = Boolean(api.apiKeyField && getApiKeyValue(api).trim())
            const setupState = hasKey ? 'ready' : 'needs-setup'
            const statusLine = hasKey
              ? api.key === 'tavily'
                ? `Search speed: ${getDepthSummary(tavilySearchDepthPreference)}`
                : 'Key set'
              : 'API key not set'
            return (
              <div
                key={api.key}
                className={`provider-catalog-row provider-catalog-row--${setupState} ${
                  selectedApi === api.key ? 'provider-catalog-row--selected' : ''
                }`}
              >
                <button
                  type="button"
                  className="provider-catalog-row__main"
                  onClick={() => onCardClick(api)}
                  aria-label={`Configure ${api.name}`}
                >
                  <span
                    className={`provider-catalog-row__logo provider-catalog-row__logo--api ${
                      hasKey ? 'provider-catalog-row__logo--enabled' : ''
                    }`}
                    style={api.color ? { color: api.color } : undefined}
                  >
                    {api.icon}
                  </span>
                  <span className="provider-catalog-row__content">
                    <span className="provider-catalog-row__title-row">
                      <span className="provider-catalog-row__title">{api.name}</span>
                      {api.key === 'tavily' && (
                        <span className="provider-catalog-row__badge">Recommended</span>
                      )}
                    </span>
                    <span
                      className={`provider-catalog-row__status provider-catalog-row__status--${setupState}`}
                    >
                      {hasKey && (
                        <span className="provider-catalog-row__status-dot" aria-hidden="true" />
                      )}
                      {statusLine}
                    </span>
                  </span>
                </button>
                <div className="provider-catalog-row__actions">
                  <Switch
                    className="provider-hub-toggle provider-catalog-row__toggle"
                    checked={hasKey}
                    onCheckedChange={(checked) => {
                      if (!checked && api.apiKeyField === 'tavilyApiKey') {
                        onChange({ tavilyApiKey: '' })
                      } else if (!checked && api.apiKeyField === 'onlineCompilerApiKey') {
                        onChange({ onlineCompilerApiKey: '' })
                      } else if (checked) {
                        onCardClick(api)
                      }
                    }}
                    aria-label={`Toggle ${api.name}`}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="provider-catalog-row__menu"
                        aria-label={`More actions for ${api.name}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreVertical size={15} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="settings-menu-surface zura-menu-surface--compact"
                    >
                      <DropdownMenuItem
                        className="zura-menu-item--compact"
                        onClick={() => onCardClick(api)}
                      >
                        Configure
                      </DropdownMenuItem>
                      {api.learnMoreUrl ? (
                        <DropdownMenuItem
                          className="zura-menu-item--compact"
                          onClick={() => window.shell?.openExternal(api.learnMoreUrl!)}
                        >
                          Learn more
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

interface SearchApiDetailProps {
  api: SearchApiDefinition
  tavilyApiKey: string
  onlineCompilerApiKey: string
  tavilySearchDepthPreference: TavilySearchDepthPreference
  webSearchIncludeImages: boolean
  onBack: () => void
  onChange: ProviderHubSectionProps['onChange']
}

export function SearchApiDetail({
  api,
  tavilyApiKey,
  onlineCompilerApiKey,
  tavilySearchDepthPreference,
  webSearchIncludeImages,
  onBack,
  onChange,
}: SearchApiDetailProps): ReactElement {
  const [showApiKey, setShowApiKey] = useState(false)
  const [displayedApiKey, setDisplayedApiKey] = useState('')
  const apiKeyValue =
    api.apiKeyField === 'tavilyApiKey'
      ? tavilyApiKey
      : api.apiKeyField === 'onlineCompilerApiKey'
        ? onlineCompilerApiKey
        : ''
  const isEnabled = Boolean(api.apiKeyField && apiKeyValue.trim())

  useEffect(() => {
    setShowApiKey(false)
    setDisplayedApiKey(isSecureApiKeyPlaceholder(apiKeyValue) ? '' : apiKeyValue)
  }, [api.apiKeyField, apiKeyValue])

  return (
    <Card
      className="settings-section-card provider-hub-base-card mt-4"
      style={{ background: 'var(--theme-background)' }}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Back to search APIs"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={api.color ? { color: api.color } : undefined}>{api.icon}</span>
            <span className="text-xl font-semibold leading-none text-foreground sm:text-2xl lg:text-[28px]">
              {api.name}
            </span>
            {api.key === 'tavily' && (
              <span className="rounded bg-[var(--theme-accent)]/20 px-2 py-0.5 text-xs font-medium text-[var(--theme-accent)]">
                Recommended
              </span>
            )}
          </div>
          <Switch
            className="provider-hub-toggle"
            checked={isEnabled}
            onCheckedChange={(checked) => {
              if (!checked && api.apiKeyField === 'tavilyApiKey') {
                onChange({ tavilyApiKey: '' })
              } else if (!checked && api.apiKeyField === 'onlineCompilerApiKey') {
                onChange({ onlineCompilerApiKey: '' })
              }
            }}
            aria-label={`Enable ${api.name}`}
          />
        </div>
        <div className="border-t border-border pt-6">
          <div className="space-y-6">
            <ProviderDetailField
              label="API Key"
              description={
                api.apiKeyField === 'tavilyApiKey'
                  ? 'Without a key, a limited free fallback is used. Add a key for best results. Only API key is required here.'
                  : 'Used for code execution requests. Add your OnlineCompiler key to enable hosted code sandbox calls.'
              }
              control={
                <div className="relative w-full">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={isSecureApiKeyPlaceholder(apiKeyValue) ? displayedApiKey : apiKeyValue}
                    onChange={(event) => {
                      setDisplayedApiKey(event.target.value)
                      if (api.apiKeyField === 'tavilyApiKey') {
                        onChange({ tavilyApiKey: event.target.value })
                      } else if (api.apiKeyField === 'onlineCompilerApiKey') {
                        onChange({ onlineCompilerApiKey: event.target.value })
                      }
                    }}
                    placeholder={
                      api.apiKeyField === 'tavilyApiKey'
                        ? isSecureApiKeyPlaceholder(tavilyApiKey)
                          ? 'Tavily key stored securely. Enter a new key to replace it.'
                          : 'tvly-...'
                        : isSecureApiKeyPlaceholder(onlineCompilerApiKey)
                          ? 'OnlineCompiler key stored securely. Enter a new key to replace it.'
                          : 'Paste your OnlineCompiler API key'
                    }
                    className="border-border bg-secondary pr-10"
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              }
            />
            {api.apiKeyField === 'tavilyApiKey' && (
              <>
                <ProviderDetailField
                  label="Search Speed"
                  description="Sets the default Tavily search depth when the model does not specify one. Auto lets the app choose per query."
                  control={
                    <Select
                      value={tavilySearchDepthPreference}
                      onValueChange={(value: TavilySearchDepthPreference) =>
                        onChange({ tavilySearchDepthPreference: value })
                      }
                    >
                      <SelectTrigger className="border-border bg-secondary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="settings-menu-surface">
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="ultra-fast">Lightning</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                        <SelectItem value="basic">Standard</SelectItem>
                        <SelectItem value="advanced">Thorough</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
                <ProviderDetailField
                  label="Result Images"
                  description="Include image results in web_search responses and show the inline image strip in chat."
                  control={
                    <div className="flex justify-end">
                      <Switch
                        checked={webSearchIncludeImages}
                        onCheckedChange={(checked) => onChange({ webSearchIncludeImages: checked })}
                        aria-label="Include web search images"
                      />
                    </div>
                  }
                />
              </>
            )}
            {api.learnMoreUrl && (
              <p className="text-sm text-muted-foreground">
                Learn more:{' '}
                <a
                  href={api.learnMoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--theme-accent)] hover:underline"
                >
                  {api.learnMoreUrl.replace(/^https?:\/\//, '')}
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
