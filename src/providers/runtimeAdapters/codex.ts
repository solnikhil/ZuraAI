import type { ProviderRuntimeAdapter } from './types'

const unavailable = () => {
  throw new Error('ChatGPT Codex is available only through the Electron main-process runtime.')
}

export const codexAdapter: ProviderRuntimeAdapter<'codex'> = {
  provider: 'codex',
  generateTitle: unavailable,
  stream() {
    return unavailable()
  },
}
