import fs from 'fs/promises'
import path from 'path'

const repoRoot = process.cwd()
const packageJsonPath = path.join(repoRoot, 'package.json')
const releaseDir = path.join(repoRoot, 'release', 'win-unpacked')
const forbiddenFiles = new Set(['mcp-servers.json', 'secure-storage.json', 'chat-history.json'])

async function main() {
  await verifyPackageConfig()
  await verifyPersistencePaths()
  await verifyReleaseDirectory()
  console.log('[verify-mcp-release] MCP packaging and persistence checks passed.')
}

async function verifyPackageConfig() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
  if (packageJson?.build?.nsis?.deleteAppDataOnUninstall !== false) {
    throw new Error(
      'Expected package.json to preserve app data on uninstall for MCP persistence safety.'
    )
  }
}

async function verifyPersistencePaths() {
  const requiredSnippets = [
    {
      file: path.join(repoRoot, 'electron', 'mcp', 'mcpStorage.ts'),
      snippet: "app.getPath('userData')",
      label: 'MCP metadata storage must remain under userData',
    },
    {
      file: path.join(repoRoot, 'electron', 'secureStorage.ts'),
      snippet: "app.getPath('userData')",
      label: 'Secure storage must remain under userData',
    },
    {
      file: path.join(repoRoot, 'electron', 'chatStore.ts'),
      snippet: "app.getPath('userData')",
      label: 'Chat store must remain under userData',
    },
  ]

  for (const { file, snippet, label } of requiredSnippets) {
    const content = await fs.readFile(file, 'utf8')
    if (!content.includes(snippet)) {
      throw new Error(label)
    }
  }
}

async function verifyReleaseDirectory() {
  const stat = await fs.stat(releaseDir).catch(() => null)
  if (!stat?.isDirectory()) {
    throw new Error(`Expected unpacked Electron build at ${releaseDir}`)
  }

  const discoveredForbiddenPaths = []
  await walkReleaseDir(releaseDir, discoveredForbiddenPaths)

  if (discoveredForbiddenPaths.length > 0) {
    throw new Error(
      `Release output unexpectedly contains persisted app data files: ${discoveredForbiddenPaths.join(', ')}`
    )
  }
}

async function walkReleaseDir(currentPath, discoveredForbiddenPaths) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    const nextPath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      await walkReleaseDir(nextPath, discoveredForbiddenPaths)
      continue
    }

    if (forbiddenFiles.has(entry.name)) {
      discoveredForbiddenPaths.push(path.relative(repoRoot, nextPath))
    }
  }
}

main().catch((error) => {
  console.error(
    '[verify-mcp-release] Failed:',
    error instanceof Error ? error.message : String(error)
  )
  process.exitCode = 1
})
