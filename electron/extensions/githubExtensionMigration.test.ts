import { readFile } from 'fs/promises'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('GitHub Workspace extension migration', () => {
  it('owns lifecycle through the extension manifest and registry only', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'extensions', 'bundled', 'github-workspace', 'zura-extension.json'), 'utf8'))
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      id: 'com.zuraai.github',
      publisher: '@zuraai',
      commands: [expect.objectContaining({ mode: 'workspace', entry: 'host:git-workspace' })],
      capabilities: { host: ['git-workspace'] },
    })

    const preload = await readFile(path.join(root, 'electron', 'preload.ts'), 'utf8')
    const workspaceHost = await readFile(path.join(root, 'electron', 'githubWorkspace.ts'), 'utf8')
    for (const legacyChannel of ['github-workspace:get-installed', 'github-workspace:install', 'github-workspace:uninstall']) {
      expect(preload).not.toContain(legacyChannel)
      expect(workspaceHost).not.toContain(legacyChannel)
    }

    expect(preload).toContain('extensions:prepare-mutation')
    expect(preload).toContain('extensions:apply-mutation')
    expect(workspaceHost).toContain('registerExtensionLifecycle(GITHUB_EXTENSION_ID')
    expect(workspaceHost).toContain('isExtensionInstalled(GITHUB_EXTENSION_ID)')
  })
})
