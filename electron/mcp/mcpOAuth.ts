import { createHash, randomBytes, randomUUID } from 'crypto'
import * as http from 'http'
import { shell } from 'electron'

import type { McpAuthConfig, McpAuthStatus, McpServerConfig } from '../../src/mcp/types'
import { getSecureValueAsync, setSecureValueAsync } from '../secureStorage'
import { buildMcpSecretStorageKey } from './mcpStorage'

const CALLBACK_HOST = '127.0.0.1'
const DEFAULT_SCOPE = 'openid profile'
const TOKEN_EXPIRY_SKEW_MS = 60_000

interface OAuthServerMetadata {
  issuer?: string
  authorization_endpoint?: string
  token_endpoint?: string
  registration_endpoint?: string
}

interface ProtectedResourceMetadata {
  authorization_servers?: string[]
  authorization_server?: string
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export interface McpOAuthStartResult {
  ok: boolean
  status: McpAuthStatus
  error?: string
}

export function getMcpAuthStatus(server: McpServerConfig): McpAuthStatus {
  const auth = server.auth ?? { mode: 'none', state: 'none' as const }
  const state = auth.state ?? (auth.mode === 'none' ? 'none' : 'configured')
  return {
    serverId: server.id,
    mode: auth.mode,
    state,
    label: formatAuthLabel(auth),
    requiresSignIn: auth.mode === 'oauth2Pkce' && state !== 'signed_in',
    lastError: auth.lastError ?? null,
    expiresAt: auth.oauth?.expiresAt,
  }
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export async function applyOAuthAuthorizationHeader(
  server: McpServerConfig
): Promise<Record<string, string>> {
  if (server.auth?.mode !== 'oauth2Pkce') return {}

  const oauth = server.auth.oauth
  const accessTokenKey =
    oauth?.accessTokenKey ?? buildMcpSecretStorageKey(server.id, 'oauth-access-token')
  let accessToken = await getSecureValueAsync(accessTokenKey)

  if (shouldRefreshToken(oauth?.expiresAt)) {
    const refreshed = await refreshOAuthToken(server)
    accessToken = refreshed.accessToken
  }

  if (!accessToken) {
    throw new Error(`MCP server "${server.name}" needs sign-in before connecting.`)
  }

  return { Authorization: `Bearer ${accessToken}` }
}

export async function startMcpOAuthFlow(
  server: McpServerConfig,
  updateServer: (server: McpServerConfig) => Promise<void>
): Promise<McpOAuthStartResult> {
  if (server.transport !== 'sse') {
    const status = getMcpAuthStatus(
      markAuthFailed(server, 'OAuth is currently supported for SSE MCP servers only.')
    )
    return { ok: false, status, error: status.lastError ?? undefined }
  }
  if (!server.url) {
    const status = getMcpAuthStatus(
      markAuthFailed(server, 'OAuth requires a saved MCP server URL.')
    )
    return { ok: false, status, error: status.lastError ?? undefined }
  }

  const nextServer = cloneServer(server)
  nextServer.auth = normalizeOAuthAuth(nextServer.auth)

  try {
    const resourceUrl = new URL(server.url)
    const resourceMetadata = await discoverProtectedResourceMetadata(
      resourceUrl,
      nextServer.auth.oauth?.resourceMetadataUrl
    )
    const authorizationServer =
      nextServer.auth.oauth?.authorizationServer ??
      resourceMetadata.authorization_servers?.[0] ??
      resourceMetadata.authorization_server

    if (!authorizationServer) {
      throw new Error('OAuth protected resource metadata did not provide an authorization server.')
    }

    const authServerMetadata = await discoverAuthorizationServerMetadata(authorizationServer)
    if (!authServerMetadata.authorization_endpoint || !authServerMetadata.token_endpoint) {
      throw new Error('Authorization server metadata is missing authorization or token endpoint.')
    }

    const callback = await createLoopbackCallback()
    const pkce = createPkcePair()
    const state = randomUUID()
    const client = await resolveOAuthClient(nextServer, authServerMetadata, callback.redirectUri)

    const authUrl = new URL(authServerMetadata.authorization_endpoint)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', client.clientId)
    authUrl.searchParams.set('redirect_uri', callback.redirectUri)
    authUrl.searchParams.set('code_challenge', pkce.challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('resource', resourceUrl.toString())
    authUrl.searchParams.set('scope', nextServer.auth.oauth?.scope || DEFAULT_SCOPE)

    await shell.openExternal(authUrl.toString())
    const callbackResult = await callback.waitForCode()
    if (callbackResult.state !== state) {
      throw new Error('OAuth callback state did not match this sign-in request.')
    }

    const token = await exchangeAuthorizationCode({
      tokenEndpoint: authServerMetadata.token_endpoint,
      code: callbackResult.code,
      redirectUri: callback.redirectUri,
      verifier: pkce.verifier,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      resource: resourceUrl.toString(),
    })

    await persistOAuthToken(nextServer.id, token)
    nextServer.auth = {
      mode: 'oauth2Pkce',
      state: 'signed_in',
      lastError: null,
      updatedAt: new Date().toISOString(),
      oauth: {
        authorizationServer,
        resourceMetadataUrl: resourceMetadataUrl(
          resourceUrl,
          nextServer.auth.oauth?.resourceMetadataUrl
        ),
        issuer: authServerMetadata.issuer,
        authorizationEndpoint: authServerMetadata.authorization_endpoint,
        tokenEndpoint: authServerMetadata.token_endpoint,
        registrationEndpoint: authServerMetadata.registration_endpoint,
        clientId: client.clientId,
        clientSecretKey: client.clientSecretKey,
        accessTokenKey: buildMcpSecretStorageKey(nextServer.id, 'oauth-access-token'),
        refreshTokenKey: buildMcpSecretStorageKey(nextServer.id, 'oauth-refresh-token'),
        expiresAt: tokenExpiresAt(token),
        scope: token.scope ?? nextServer.auth.oauth?.scope ?? DEFAULT_SCOPE,
        tokenType: token.token_type ?? 'Bearer',
      },
    }

    await updateServer(nextServer)
    return { ok: true, status: getMcpAuthStatus(nextServer) }
  } catch (error) {
    nextServer.auth = {
      ...normalizeOAuthAuth(nextServer.auth),
      state: 'failed',
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    }
    await updateServer(nextServer)
    const status = getMcpAuthStatus(nextServer)
    return { ok: false, status, error: status.lastError ?? undefined }
  }
}

export async function clearMcpOAuth(server: McpServerConfig): Promise<McpServerConfig> {
  const oauth = server.auth?.oauth
  await Promise.all([
    setSecureValueAsync(
      oauth?.accessTokenKey ?? buildMcpSecretStorageKey(server.id, 'oauth-access-token'),
      ''
    ),
    setSecureValueAsync(
      oauth?.refreshTokenKey ?? buildMcpSecretStorageKey(server.id, 'oauth-refresh-token'),
      ''
    ),
    oauth?.clientSecretKey ? setSecureValueAsync(oauth.clientSecretKey, '') : Promise.resolve(true),
  ])

  return {
    ...server,
    auth: {
      mode: 'oauth2Pkce',
      state: 'reauth_required',
      lastError: null,
      updatedAt: new Date().toISOString(),
      oauth,
    },
  }
}

async function refreshOAuthToken(server: McpServerConfig): Promise<{ accessToken: string }> {
  const oauth = server.auth?.oauth
  const tokenEndpoint = oauth?.tokenEndpoint
  const clientId = oauth?.clientId
  if (!tokenEndpoint || !clientId) {
    throw new Error(`MCP server "${server.name}" needs sign-in before connecting.`)
  }

  const refreshTokenKey =
    oauth.refreshTokenKey ?? buildMcpSecretStorageKey(server.id, 'oauth-refresh-token')
  const refreshToken = await getSecureValueAsync(refreshTokenKey)
  if (!refreshToken) {
    throw new Error(`MCP server "${server.name}" needs sign-in before connecting.`)
  }

  const clientSecret = oauth.clientSecretKey ? await getSecureValueAsync(oauth.clientSecretKey) : ''
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })
  if (clientSecret) body.set('client_secret', clientSecret)

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error(`OAuth refresh failed with ${response.status} ${response.statusText}`)
  }

  const token = (await response.json()) as TokenResponse
  await persistOAuthToken(server.id, token)
  return { accessToken: token.access_token ?? '' }
}

async function discoverProtectedResourceMetadata(
  resourceUrl: URL,
  explicitMetadataUrl?: string
): Promise<ProtectedResourceMetadata> {
  const candidates = [
    resourceMetadataUrl(resourceUrl, explicitMetadataUrl),
    new URL('/.well-known/oauth-protected-resource', resourceUrl.origin).toString(),
  ]

  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate, { headers: { accept: 'application/json' } })
      if (response.ok) return (await response.json()) as ProtectedResourceMetadata
    } catch {
      // Try next discovery location.
    }
  }

  return {}
}

async function discoverAuthorizationServerMetadata(issuer: string): Promise<OAuthServerMetadata> {
  const issuerUrl = new URL(issuer)
  const candidates = [
    new URL('/.well-known/oauth-authorization-server', issuerUrl.origin).toString(),
    new URL('/.well-known/openid-configuration', issuerUrl.origin).toString(),
  ]

  for (const candidate of candidates) {
    const response = await fetch(candidate, { headers: { accept: 'application/json' } })
    if (response.ok) return (await response.json()) as OAuthServerMetadata
  }

  throw new Error('Unable to discover OAuth authorization server metadata.')
}

async function resolveOAuthClient(
  server: McpServerConfig,
  metadata: OAuthServerMetadata,
  redirectUri: string
): Promise<{ clientId: string; clientSecret?: string; clientSecretKey?: string }> {
  const existingClientId = server.auth?.oauth?.clientId
  if (existingClientId) {
    const clientSecretKey = server.auth?.oauth?.clientSecretKey
    return {
      clientId: existingClientId,
      clientSecret: clientSecretKey ? await getSecureValueAsync(clientSecretKey) : undefined,
      clientSecretKey,
    }
  }

  if (!metadata.registration_endpoint) {
    throw new Error(
      'Authorization server does not support dynamic client registration. Add a client ID in advanced MCP auth settings.'
    )
  }

  const response = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'ZuraAI',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Dynamic client registration failed with ${response.status} ${response.statusText}`
    )
  }

  const registered = (await response.json()) as { client_id?: string; client_secret?: string }
  if (!registered.client_id) {
    throw new Error('Dynamic client registration did not return a client ID.')
  }

  let clientSecretKey: string | undefined
  if (registered.client_secret) {
    clientSecretKey = buildMcpSecretStorageKey(server.id, 'oauth-client-secret')
    await setSecureValueAsync(clientSecretKey, registered.client_secret)
  }

  return { clientId: registered.client_id, clientSecret: registered.client_secret, clientSecretKey }
}

async function exchangeAuthorizationCode(options: {
  tokenEndpoint: string
  code: string
  redirectUri: string
  verifier: string
  clientId: string
  clientSecret?: string
  resource: string
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.verifier,
    client_id: options.clientId,
    resource: options.resource,
  })
  if (options.clientSecret) body.set('client_secret', options.clientSecret)

  const response = await fetch(options.tokenEndpoint, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed with ${response.status} ${response.statusText}`)
  }

  const token = (await response.json()) as TokenResponse
  if (!token.access_token) {
    throw new Error('OAuth token exchange did not return an access token.')
  }
  return token
}

async function persistOAuthToken(serverId: string, token: TokenResponse): Promise<void> {
  if (token.access_token) {
    await setSecureValueAsync(
      buildMcpSecretStorageKey(serverId, 'oauth-access-token'),
      token.access_token
    )
  }
  if (token.refresh_token) {
    await setSecureValueAsync(
      buildMcpSecretStorageKey(serverId, 'oauth-refresh-token'),
      token.refresh_token
    )
  }
}

function tokenExpiresAt(token: TokenResponse): number | undefined {
  return typeof token.expires_in === 'number' && Number.isFinite(token.expires_in)
    ? Date.now() + Math.max(0, token.expires_in * 1000)
    : undefined
}

function shouldRefreshToken(expiresAt: number | undefined): boolean {
  return (
    typeof expiresAt === 'number' && expiresAt > 0 && expiresAt - Date.now() <= TOKEN_EXPIRY_SKEW_MS
  )
}

function normalizeOAuthAuth(auth: McpAuthConfig | undefined): McpAuthConfig {
  return {
    mode: 'oauth2Pkce',
    state: auth?.state ?? 'reauth_required',
    lastError: auth?.lastError ?? null,
    updatedAt: auth?.updatedAt,
    oauth: auth?.oauth ? { ...auth.oauth } : undefined,
  }
}

function markAuthFailed(server: McpServerConfig, message: string): McpServerConfig {
  return {
    ...server,
    auth: {
      ...normalizeOAuthAuth(server.auth),
      state: 'failed',
      lastError: message,
      updatedAt: new Date().toISOString(),
    },
  }
}

function formatAuthLabel(auth: McpAuthConfig): string {
  if (auth.mode === 'none') return 'No auth'
  if (auth.mode === 'oauth2Pkce') {
    if (auth.state === 'signed_in') return 'Signed in'
    if (auth.state === 'failed') return 'Auth failed'
    return 'Needs sign-in'
  }
  return 'Key saved'
}

function resourceMetadataUrl(resourceUrl: URL, explicitMetadataUrl?: string): string {
  if (explicitMetadataUrl) return explicitMetadataUrl
  return new URL('/.well-known/oauth-protected-resource', resourceUrl.origin).toString()
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function cloneServer(server: McpServerConfig): McpServerConfig {
  return {
    ...server,
    env: [...(server.env ?? [])],
    headers: [...(server.headers ?? [])],
    auth: server.auth
      ? { ...server.auth, oauth: server.auth.oauth ? { ...server.auth.oauth } : undefined }
      : undefined,
  }
}

function createLoopbackCallback(): Promise<{
  redirectUri: string
  waitForCode: () => Promise<{ code: string; state: string }>
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    let redirectUri = ''
    let callbackResolve: ((value: { code: string; state: string }) => void) | null = null
    let callbackReject: ((reason: Error) => void) | null = null
    const callbackPromise = new Promise<{ code: string; state: string }>(
      (innerResolve, innerReject) => {
        callbackResolve = innerResolve
        callbackReject = innerReject
      }
    )
    const timeout = setTimeout(() => {
      server.close()
      const error = new Error('Timed out waiting for OAuth callback.')
      callbackReject?.(error)
    }, 5 * 60_000)

    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', redirectUri || `http://${CALLBACK_HOST}`)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      response.writeHead(error ? 400 : 200, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(
        error
          ? `ZuraAI MCP sign-in failed: ${error}`
          : 'ZuraAI MCP sign-in complete. You can close this window.'
      )
      clearTimeout(timeout)
      server.close()

      if (error) {
        callbackReject?.(new Error(`OAuth callback failed: ${error}`))
        return
      }
      if (!code || !state) {
        callbackReject?.(new Error('OAuth callback was missing code or state.'))
        return
      }

      callbackResolve?.({ code, state })
    })

    server.listen(0, CALLBACK_HOST, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        clearTimeout(timeout)
        server.close()
        reject(new Error('Unable to allocate OAuth callback port.'))
        return
      }

      redirectUri = `http://${CALLBACK_HOST}:${address.port}/mcp/oauth/callback`
      resolve({
        redirectUri,
        waitForCode: () => callbackPromise,
      })
    })
  })
}
