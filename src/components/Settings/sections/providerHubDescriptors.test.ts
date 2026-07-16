import { describe, expect, it } from 'vitest'
import {
  buildProviderModelUpdate,
  createProviderModelMap,
  getBrowserConnectivityDescriptor,
  PROVIDER_HUB_DEFINITIONS,
} from './providerHubDescriptors'

const model = { code: 'test/model', displayName: 'Test model' }

describe('Provider Hub descriptors', () => {
  it('maps provider model collections through the typed provider contract', () => {
    const map = createProviderModelMap({
      configuredModels: [model],
      codexModels: [],
      groqModels: [],
      alibabaModels: [],
      deepseekModels: [],
      opencodeModels: [],
      fireworksModels: [],
      nvidiaModels: [],
      ollamaModels: [],
    })
    expect(map.openrouter).toEqual([model])
    expect(map.codex).toEqual([])
  })

  it('derives visible provider setup metadata from the provider registry', () => {
    expect(PROVIDER_HUB_DEFINITIONS.find((provider) => provider.key === 'codex')).toEqual(
      expect.objectContaining({ setupKind: 'account', apiKeyField: undefined })
    )
    expect(PROVIDER_HUB_DEFINITIONS.find((provider) => provider.key === 'openrouter')).toEqual(
      expect.objectContaining({ setupKind: 'api-key', apiKeyField: 'openRouterApiKey' })
    )
  })

  it('builds model updates using registry-owned setting fields', () => {
    expect(buildProviderModelUpdate('deepseek', [model])).toEqual({ deepseekModels: [model] })
    expect(buildProviderModelUpdate('openrouter', [model])).toEqual({ configuredModels: [model] })
  })

  it('describes browser-only connectivity without component branching', () => {
    expect(getBrowserConnectivityDescriptor('openrouter')).toEqual({
      kind: 'bearer-get',
      path: '/auth/key',
      failurePrefix: 'OpenRouter auth failed',
    })
    expect(getBrowserConnectivityDescriptor('nvidia')).toEqual({
      kind: 'chat-completions',
      failurePrefix: 'NVIDIA NIM check failed',
    })
    expect(getBrowserConnectivityDescriptor('codex')).toEqual({ kind: 'unsupported' })
  })
})
