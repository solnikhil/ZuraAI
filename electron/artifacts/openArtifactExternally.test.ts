import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  openPath: vi.fn(async () => ''),
  getPath: vi.fn(() => '/tmp/zura-user-data'),
}))

vi.mock('fs/promises', () => ({
  default: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: mocks.getPath,
  },
  shell: {
    openPath: mocks.openPath,
  },
}))

import { openArtifactExternally } from './openArtifactExternally'

describe('openArtifactExternally', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes the artifact and opens it with the OS default app', async () => {
    const result = await openArtifactExternally({
      sessionId: 'session-1',
      artifactId: 'artifact-1',
      title: 'Landing Page',
      kind: 'html',
      content: '<html><body>Hello</body></html>',
    })

    expect(result.ok).toBe(true)
    expect(mocks.mkdir).toHaveBeenCalled()
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('Landing-Page.html'),
      '<html><body>Hello</body></html>',
      'utf8'
    )
    expect(mocks.openPath).toHaveBeenCalledWith(expect.stringContaining('Landing-Page.html'))
  })

  it('rejects invalid payloads', async () => {
    const result = await openArtifactExternally({ title: 'Missing fields' })
    expect(result.ok).toBe(false)
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('surfaces shell.openPath failures', async () => {
    mocks.openPath.mockResolvedValueOnce('No application found')

    const result = await openArtifactExternally({
      sessionId: 'session-1',
      artifactId: 'artifact-2',
      title: 'Diagram',
      kind: 'mermaid',
      content: 'graph TD; A-->B;',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('No application found')
  })
})