#!/usr/bin/env node
/**
 * Generator for src/mcp/catalogue.json from the official MCP Registry.
 * Resumable via scripts/.mcp-registry-cache.json
 *
 * Usage: node scripts/generate-mcp-catalogue.mjs
 */

import fs from 'fs/promises'
import path from 'path'

const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers'
const OUTPUT_PATH = path.join(process.cwd(), 'src', 'mcp', 'catalogue.json')
const CACHE_PATH = path.join(process.cwd(), 'scripts', '.mcp-registry-cache.json')
const PAGE_LIMIT = 100
const MAX_PAGES_PER_RUN = 5

const BASELINE_PATH = path.join(process.cwd(), 'scripts', 'mcp-catalogue-baseline.json')

function publisherFromName(name) {
  const [org] = String(name || '').split('/')
  if (!org) return undefined
  const label = org
    .split('.')
    .filter((part) => !['io', 'com', 'ai', 'dev', 'app', 'org'].includes(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return label || org
}

function setupTargetForSecret(name) {
  const normalized = String(name || '').toLowerCase()
  if (normalized === 'authorization' || normalized === 'x-api-key' || normalized.startsWith('bearer')) {
    return 'authToken'
  }
  return 'header'
}

function buildSetup(server) {
  const setup = []
  const seen = new Set()

  for (const pkg of server.packages ?? []) {
    for (const variable of pkg.environmentVariables ?? []) {
      const varName = variable?.name?.trim()
      if (!varName || seen.has(varName)) continue
      seen.add(varName)
      setup.push({
        name: varName,
        description: variable.description?.trim() || undefined,
        secret: variable.isSecret === true,
        required: variable.isRequired === true,
        target: 'env',
      })
    }
  }

  for (const remote of server.remotes ?? []) {
    for (const header of remote.headers ?? []) {
      const headerName = header?.name?.trim()
      if (!headerName || seen.has(headerName)) continue
      if (!header.isSecret && !header.isRequired) continue
      seen.add(headerName)
      setup.push({
        name: headerName,
        description: header.description?.trim() || undefined,
        secret: header.isSecret === true,
        required: header.isRequired === true,
        target: setupTargetForSecret(headerName),
      })
    }
  }

  return setup
}

function pickInstall(server) {
  const packages = server.packages ?? []
  const remotes = server.remotes ?? []

  const npmPackage = packages.find((pkg) => pkg.registryType === 'npm' && pkg.identifier?.trim())
  if (npmPackage) {
    return { type: 'npm', identifier: npmPackage.identifier.trim() }
  }

  const pypiPackage = packages.find((pkg) => pkg.registryType === 'pypi' && pkg.identifier?.trim())
  if (pypiPackage) {
    return { type: 'pypi', identifier: pypiPackage.identifier.trim() }
  }

  const sseRemote = remotes.find((remote) => remote.type === 'sse' && remote.url?.trim())
  if (sseRemote) {
    return { type: 'sse', url: sseRemote.url.trim() }
  }

  const websocketRemote = remotes.find((remote) => remote.type === 'websocket' && remote.url?.trim())
  if (websocketRemote) {
    return { type: 'websocket', url: websocketRemote.url.trim() }
  }

  const streamableRemote = remotes.find(
    (remote) => remote.type === 'streamable-http' && remote.url?.trim()
  )
  if (streamableRemote) {
    return {
      type: 'streamable-http',
      url: streamableRemote.url.trim(),
      reason: 'ZuraAI does not support streamable-http MCP transport yet.',
    }
  }

  const dockerPackage = packages.find((pkg) => pkg.registryType === 'oci' && pkg.identifier?.trim())
  if (dockerPackage) {
    return {
      type: 'oci',
      reason: 'ZuraAI catalogue does not install OCI/Docker MCP servers automatically yet.',
    }
  }

  return {
    type: 'unsupported',
    reason: 'This catalogue entry does not expose an install target ZuraAI can configure yet.',
  }
}

function toCatalogueEntry(server) {
  const install = pickInstall(server)
  const setup = buildSetup(server)

  return {
    name: server.name,
    title: server.title?.trim() || undefined,
    description: server.description?.trim() || undefined,
    version: server.version?.trim() || undefined,
    repositoryUrl: server.repository?.url?.trim() || server.websiteUrl?.trim() || undefined,
    publisher: publisherFromName(server.name),
    install,
    setup: setup.length > 0 ? setup : undefined,
  }
}

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { cursor: null, byName: {}, complete: false, pagesFetched: 0 }
  }
}

async function writeCache(cache) {
  await fs.writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
}

async function fetchRegistryChunk(cache) {
  let cursor = cache.cursor
  let pages = 0

  while (pages < MAX_PAGES_PER_RUN) {
    const url = new URL(REGISTRY_URL)
    url.searchParams.set('limit', String(PAGE_LIMIT))
    if (cursor) {
      url.searchParams.set('cursor', cursor)
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Registry request failed (${response.status})`)
    }

    const payload = await response.json()
    const servers = payload.servers ?? []
    if (servers.length === 0) {
      cache.complete = true
      cache.cursor = null
      break
    }

    for (const item of servers) {
      const server = item.server
      const meta = item._meta?.['io.modelcontextprotocol.registry/official']
      if (!server?.name) continue
      if (meta?.status === 'deprecated') continue

      const existing = cache.byName[server.name]
      if (!existing || meta?.isLatest) {
        cache.byName[server.name] = server
      }
    }

    pages += 1
    cache.pagesFetched += 1
    cursor = payload.metadata?.nextCursor ?? null
    cache.cursor = cursor

    process.stdout.write(
      `\rFetched page ${cache.pagesFetched}, ${Object.keys(cache.byName).length} unique servers...`
    )
    await writeCache(cache)

    if (!cursor) {
      cache.complete = true
      break
    }
  }

  process.stdout.write('\n')
  return cache
}

async function loadBaselineEntries() {
  try {
    const raw = await fs.readFile(BASELINE_PATH, 'utf8')
    const entries = JSON.parse(raw)
    return Array.isArray(entries) ? entries : []
  } catch {
    return []
  }
}

async function writeCatalogue(cache) {
  const baselineByName = new Map((await loadBaselineEntries()).map((entry) => [entry.name, entry]))
  const catalogueByName = new Map(
    Object.values(cache.byName)
      .map((server) => toCatalogueEntry(server))
      .filter((entry) => entry.name)
      .map((entry) => [entry.name, entry])
  )

  for (const [name, entry] of baselineByName) {
    catalogueByName.set(name, entry)
  }

  const catalogue = [...catalogueByName.values()].sort((left, right) => {
    const leftTitle = (left.title || left.name).toLowerCase()
    const rightTitle = (right.title || right.name).toLowerCase()
    return leftTitle.localeCompare(rightTitle)
  })

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8')

  const supported = catalogue.filter((entry) => {
    const type = entry.install?.type
    return type === 'npm' || type === 'pypi' || type === 'sse' || type === 'websocket'
  }).length

  console.log(`Wrote ${catalogue.length} catalogue entries to ${OUTPUT_PATH}`)
  console.log(`  Supported installs: ${supported}`)
  console.log(`  Unsupported/other: ${catalogue.length - supported}`)
}

async function main() {
  let cache = await readCache()

  if (!cache.complete) {
    cache = await fetchRegistryChunk(cache)
    await writeCache(cache)
  }

  if (!cache.complete) {
    console.log('Registry fetch incomplete. Re-run this script to continue from cache.')
    process.exitCode = 2
    return
  }

  await writeCatalogue(cache)
}

main().catch(async (error) => {
  console.error('[generate-mcp-catalogue] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})