/**
 * Codex Authentication Handler
 * 
 * Manages OAuth authentication flow for OpenAI Codex CLI integration.
 * Handles token storage, validation, and API requests.
 */

import { BrowserWindow, ipcMain, shell, safeStorage, app } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as url from 'url'

// ============================================================================
// Types
// ============================================================================

export interface CodexTokenData {
    accessToken: string      // The access_token for API calls (OAuth access_token OR openai_api_key)
    openaiApiKey?: string    // API key from token exchange (has api.responses.write scope!)
    refreshToken?: string    // OAuth refresh token
    idToken?: string         // OAuth id_token JWT
    chatgptAccountId?: string // Account ID from id_token claims (required for API calls!)
    expiresAt: number        // Unix timestamp in milliseconds
    userEmail: string
    organization?: string
}

export interface CodexAuthState {
    isAuthenticated: boolean
    userEmail?: string
    expiresAt?: number
    error?: string
}

interface OAuthCallbackData {
    code?: string
    error?: string
    state?: string
}

// ============================================================================
// Constants
// ============================================================================

const CODEX_TOKEN_FILE = path.join(app.getPath('userData'), 'codex-auth.json')
const OAUTH_REDIRECT_PORT = 1455  // Official Codex CLI port
const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_REDIRECT_PORT}/auth/callback`

// OpenAI OAuth endpoints (from official Codex CLI)
const OPENAI_AUTH_URL = 'https://auth.openai.com/oauth/authorize'
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const OPENAI_USERINFO_URL = 'https://api.openai.com/v1/me'
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'  // Official Codex CLI client ID
const OAUTH_SCOPE = 'openid profile email offline_access'

// API base URL for Codex
// CRITICAL: ChatGPT OAuth uses a different backend than API key auth!
// - ChatGPT OAuth: https://chatgpt.com/backend-api/codex
// - API Key: https://api.openai.com/v1
const CODEX_API_BASE = 'https://chatgpt.com/backend-api/codex'

// OpenAI API base for user info endpoints (still uses api.openai.com)
const OPENAI_API_BASE = 'https://api.openai.com'

// Store last known rate limit data from API responses
let lastKnownRateLimits: {
    limitRequests?: number
    limitTokens?: number
    remainingRequests?: number
    remainingTokens?: number
    resetRequests?: string
    resetTokens?: string
    updatedAt?: number
} = {}

/**
 * Extract and store rate limit headers from API response
 */
function extractRateLimitHeaders(headers: Headers): void {
    const limitRequests = headers.get('x-ratelimit-limit-requests')
    const limitTokens = headers.get('x-ratelimit-limit-tokens')
    const remainingRequests = headers.get('x-ratelimit-remaining-requests')
    const remainingTokens = headers.get('x-ratelimit-remaining-tokens')
    const resetRequests = headers.get('x-ratelimit-reset-requests')
    const resetTokens = headers.get('x-ratelimit-reset-tokens')

    // Only update if we got any rate limit data
    if (limitRequests || limitTokens || remainingRequests || remainingTokens) {
        lastKnownRateLimits = {
            limitRequests: limitRequests ? parseInt(limitRequests, 10) : lastKnownRateLimits.limitRequests,
            limitTokens: limitTokens ? parseInt(limitTokens, 10) : lastKnownRateLimits.limitTokens,
            remainingRequests: remainingRequests ? parseInt(remainingRequests, 10) : lastKnownRateLimits.remainingRequests,
            remainingTokens: remainingTokens ? parseInt(remainingTokens, 10) : lastKnownRateLimits.remainingTokens,
            resetRequests: resetRequests || lastKnownRateLimits.resetRequests,
            resetTokens: resetTokens || lastKnownRateLimits.resetTokens,
            updatedAt: Date.now()
        }
        console.log('[CodexAuth] Rate limit headers captured:', lastKnownRateLimits)
    }
}

/**
 * Get last known rate limits
 */
export function getLastKnownRateLimits() {
    return lastKnownRateLimits
}

// ============================================================================
// Models Cache (for base_instructions)
// ============================================================================

interface CachedModelInfo {
    slug: string
    base_instructions: string | null
    display_name: string
    description: string
}

let cachedModels: Map<string, CachedModelInfo> = new Map()
let modelsCacheTimestamp = 0
const MODELS_CACHE_TTL = 3600000  // 1 hour

/**
 * Fetch models from the Codex API and cache their base_instructions
 * This is CRITICAL because the API validates instructions against the server's copy
 */
export async function fetchAndCacheModels(): Promise<boolean> {
    try {
        const token = await loadToken()
        if (!token) {
            console.log('[CodexAuth:Models] No token available, cannot fetch models')
            return false
        }

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
            'originator': 'codex_cli_rs',
            'User-Agent': 'codex_cli_rs/1.0.0 ZuraAI',
            'version': '1.0.0'
        }

        // Add ChatGPT-Account-Id header if available
        if (token.chatgptAccountId) {
            headers['ChatGPT-Account-Id'] = token.chatgptAccountId
        }

        console.log('[CodexAuth:Models] Fetching models from API...')
        const response = await fetch(`${CODEX_API_BASE}/models?client_version=1.0.0`, {
            method: 'GET',
            headers
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[CodexAuth:Models] Failed to fetch models:', response.status, errorText)
            return false
        }

        const data = await response.json()
        const models = data.models || []

        console.log('[CodexAuth:Models] Received', models.length, 'models')

        // Cache each model's base_instructions
        cachedModels.clear()
        for (const model of models) {
            if (model.slug) {
                cachedModels.set(model.slug, {
                    slug: model.slug,
                    base_instructions: model.base_instructions || null,
                    display_name: model.display_name || model.slug,
                    description: model.description || ''
                })
                console.log(`[CodexAuth:Models] Cached model: ${model.slug}, instructions length: ${model.base_instructions?.length || 0}`)
            }
        }

        modelsCacheTimestamp = Date.now()
        console.log('[CodexAuth:Models] Models cache updated with', cachedModels.size, 'models')
        return true
    } catch (error) {
        console.error('[CodexAuth:Models] Error fetching models:', error)
        return false
    }
}

/**
 * Get cached base_instructions for a model
 * Returns null if not cached or cache expired
 */
export function getCachedBaseInstructions(modelSlug: string): string | null {
    // Check if cache is expired
    if (Date.now() - modelsCacheTimestamp > MODELS_CACHE_TTL) {
        console.log('[CodexAuth:Models] Cache expired, returning null')
        return null
    }

    const model = cachedModels.get(modelSlug)
    if (model) {
        console.log(`[CodexAuth:Models] Found cached instructions for ${modelSlug}, length: ${model.base_instructions?.length || 0}`)
        return model.base_instructions
    }

    // Try to find by prefix (e.g., gpt-5.2-codex-high -> gpt-5.2-codex)
    for (const [slug, info] of cachedModels) {
        if (modelSlug.startsWith(slug) || slug.startsWith(modelSlug)) {
            console.log(`[CodexAuth:Models] Found cached instructions for ${modelSlug} via prefix match with ${slug}`)
            return info.base_instructions
        }
    }

    console.log(`[CodexAuth:Models] No cached instructions found for ${modelSlug}`)
    return null
}

/**
 * Check if models cache needs refresh
 */
export function needsModelsRefresh(): boolean {
    return cachedModels.size === 0 || Date.now() - modelsCacheTimestamp > MODELS_CACHE_TTL
}

// ============================================================================
// JWT Parsing (for extracting chatgpt_account_id from id_token)
// ============================================================================

interface IdTokenClaims {
    email?: string
    'https://api.openai.com/auth'?: {
        chatgpt_plan_type?: string
        chatgpt_account_id?: string
        organization_id?: string
    }
}

/**
 * Parse JWT id_token to extract claims
 * The chatgpt_account_id is REQUIRED for API calls to /v1/responses
 */
function parseIdToken(idToken: string): { email?: string; chatgptAccountId?: string; planType?: string } {
    try {
        // JWT format: header.payload.signature
        const parts = idToken.split('.')
        if (parts.length !== 3) {
            console.error('[CodexAuth] Invalid JWT format')
            return {}
        }

        // Decode payload (base64url)
        const payload = parts[1]
        // Convert base64url to base64
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
        const decoded = Buffer.from(padded, 'base64').toString('utf-8')
        const claims: IdTokenClaims = JSON.parse(decoded)

        const authClaims = claims['https://api.openai.com/auth']
        
        // #region agent log
        console.log('[CodexAuth][DEBUG] Parsed id_token claims:')
        console.log('[CodexAuth][DEBUG]   email:', claims.email)
        console.log('[CodexAuth][DEBUG]   chatgpt_account_id:', authClaims?.chatgpt_account_id)
        console.log('[CodexAuth][DEBUG]   chatgpt_plan_type:', authClaims?.chatgpt_plan_type)
        console.log('[CodexAuth][DEBUG]   organization_id:', authClaims?.organization_id)
        // #endregion

        return {
            email: claims.email,
            chatgptAccountId: authClaims?.chatgpt_account_id,
            planType: authClaims?.chatgpt_plan_type
        }
    } catch (error) {
        console.error('[CodexAuth] Failed to parse id_token:', error)
        return {}
    }
}

// ============================================================================
// Token Storage
// ============================================================================

let cachedToken: CodexTokenData | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5000  // 5 seconds

/**
 * Check if encryption is available
 */
function isEncryptionAvailable(): boolean {
    try {
        return safeStorage.isEncryptionAvailable()
    } catch {
        return false
    }
}

/**
 * Store token securely using safeStorage
 */
export async function storeToken(token: CodexTokenData): Promise<boolean> {
    try {
        const dir = path.dirname(CODEX_TOKEN_FILE)
        if (!fsSync.existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true })
        }

        const tokenJson = JSON.stringify(token)
        let dataToWrite: string

        if (isEncryptionAvailable()) {
            // Encrypt the token data
            const encrypted = safeStorage.encryptString(tokenJson)
            dataToWrite = JSON.stringify({
                encrypted: true,
                data: encrypted.toString('base64')
            })
        } else {
            // Store as-is if encryption not available (development mode)
            console.warn('[CodexAuth] Encryption not available, storing token without encryption')
            dataToWrite = JSON.stringify({
                encrypted: false,
                data: tokenJson
            })
        }

        await fs.writeFile(CODEX_TOKEN_FILE, dataToWrite, 'utf-8')

        // Update cache
        cachedToken = token
        cacheTimestamp = Date.now()

        return true
    } catch (error) {
        console.error('[CodexAuth] Failed to store token:', error)
        return false
    }
}

/**
 * Load token from secure storage
 */
export async function loadToken(): Promise<CodexTokenData | null> {
    // Check cache first
    if (cachedToken && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedToken
    }

    try {
        if (!fsSync.existsSync(CODEX_TOKEN_FILE)) {
            return null
        }

        const fileContent = await fs.readFile(CODEX_TOKEN_FILE, 'utf-8')
        const stored = JSON.parse(fileContent)

        let tokenJson: string

        if (stored.encrypted && isEncryptionAvailable()) {
            // Decrypt the token
            const encrypted = Buffer.from(stored.data, 'base64')
            tokenJson = safeStorage.decryptString(encrypted)
        } else if (!stored.encrypted) {
            // Not encrypted (development mode)
            tokenJson = stored.data
        } else {
            // Encrypted but encryption not available - can't decrypt
            console.error('[CodexAuth] Token is encrypted but encryption not available')
            return null
        }

        const token: CodexTokenData = JSON.parse(tokenJson)

        // Update cache
        cachedToken = token
        cacheTimestamp = Date.now()

        return token
    } catch (error) {
        console.error('[CodexAuth] Failed to load token:', error)
        return null
    }
}

/**
 * Clear stored token (logout)
 */
export async function clearToken(): Promise<void> {
    try {
        if (fsSync.existsSync(CODEX_TOKEN_FILE)) {
            await fs.unlink(CODEX_TOKEN_FILE)
        }
        cachedToken = null
        cacheTimestamp = 0
    } catch (error) {
        console.error('[CodexAuth] Failed to clear token:', error)
    }
}

/**
 * Get user info from OpenAI API
 */
async function getUserInfo(accessToken: string): Promise<{ email?: string; organization?: string }> {
    try {
        const response = await fetch(OPENAI_USERINFO_URL, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })

        if (response.ok) {
            const data = await response.json()
            return {
                email: data.email,
                organization: data.organization?.id
            }
        }
    } catch (error) {
        console.warn('[CodexAuth] Failed to get user info:', error)
    }

    return {}
}

/**
 * Obtain API key via token exchange
 * This exchanges the id_token for an API key with proper scopes (api.responses.write)
 * Reference: research-codex/codex/codex-rs/login/src/server.rs obtain_api_key()
 */
async function obtainApiKey(idToken: string): Promise<string | null> {
    try {
        console.log('[CodexAuth] Attempting token exchange for API key...')
        
        const response = await fetch(OPENAI_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                client_id: OPENAI_CLIENT_ID,
                requested_token: 'openai-api-key',
                subject_token: idToken,
                subject_token_type: 'urn:ietf:params:oauth:token-type:id_token'
            })
        })

        // #region agent log
        console.log('[CodexAuth][DEBUG] Token exchange response status:', response.status, response.statusText)
        // #endregion

        if (!response.ok) {
            const errorText = await response.text()
            console.warn('[CodexAuth] API key token exchange failed:', response.status, errorText)
            console.warn('[CodexAuth] This is expected for accounts without platform onboarding.')
            console.warn('[CodexAuth] Will fall back to using access_token directly.')
            return null
        }

        const exchangeResponse = await response.json() as {
            access_token?: string
        }

        if (exchangeResponse.access_token) {
            console.log('[CodexAuth] Successfully obtained API key via token exchange!')
            // #region agent log
            console.log('[CodexAuth][DEBUG] API key prefix:', exchangeResponse.access_token.substring(0, 10) + '...')
            // #endregion
            return exchangeResponse.access_token
        }

        console.warn('[CodexAuth] Token exchange response missing access_token')
        return null
    } catch (error) {
        console.warn('[CodexAuth] Token exchange error:', error)
        return null
    }
}

/**
 * Refresh access token using refresh token
 * Also re-exchanges for API key with proper scopes
 */
export async function refreshAccessToken(refreshToken: string): Promise<CodexTokenData | null> {
    try {
        console.log('[CodexAuth] Refreshing access token...')

        const response = await fetch(OPENAI_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: OPENAI_CLIENT_ID,
            }),
        })

        if (!response.ok) {
            const text = await response.text()
            console.error('[CodexAuth] Token refresh failed:', response.status, text)
            return null
        }

        const json = await response.json() as {
            id_token?: string
            access_token?: string
            refresh_token?: string
            expires_in?: number
        }

        if (!json?.access_token || !json?.refresh_token || typeof json?.expires_in !== 'number') {
            console.error('[CodexAuth] Token refresh response missing fields:', json)
            return null
        }

        console.log('[CodexAuth] Token refresh successful')
        console.log('[CodexAuth][DEBUG] Refresh got id_token:', !!json.id_token)

        // Parse id_token to extract chatgpt_account_id (CRITICAL for API calls)
        let chatgptAccountId: string | undefined
        let parsedEmail: string | undefined
        if (json.id_token) {
            const idTokenClaims = parseIdToken(json.id_token)
            chatgptAccountId = idTokenClaims.chatgptAccountId
            parsedEmail = idTokenClaims.email
        }

        // CRITICAL: Re-obtain API key via token exchange after refresh
        let openaiApiKey: string | null = null
        if (json.id_token) {
            openaiApiKey = await obtainApiKey(json.id_token)
        }

        // Get user info with new token
        const userInfo = await getUserInfo(json.access_token)

        const newToken: CodexTokenData = {
            // Use openaiApiKey if available (has proper scopes), otherwise fall back to access_token
            accessToken: openaiApiKey || json.access_token,
            openaiApiKey: openaiApiKey || undefined,
            refreshToken: json.refresh_token,
            idToken: json.id_token,
            chatgptAccountId: chatgptAccountId,
            expiresAt: Date.now() + json.expires_in * 1000,
            userEmail: parsedEmail || userInfo.email || 'unknown',
            organization: userInfo.organization
        }

        console.log('[CodexAuth] Token refreshed successfully')
        console.log('[CodexAuth]   chatgptAccountId:', newToken.chatgptAccountId || 'MISSING!')
        console.log('[CodexAuth]   hasOpenaiApiKey:', !!newToken.openaiApiKey)
        return newToken
    } catch (error) {
        console.error('[CodexAuth] Token refresh error:', error)
        return null
    }
}


/**
 * Validate token by checking expiration and attempting refresh if expired
 */
export async function validateToken(token?: CodexTokenData): Promise<boolean> {
    const tokenToValidate = token || await loadToken()

    if (!tokenToValidate) {
        return false
    }

    // Check if token is expired
    if (tokenToValidate.expiresAt && Date.now() >= tokenToValidate.expiresAt) {
        console.log('[CodexAuth] Token expired, attempting refresh...')

        // Try to refresh the token
        if (tokenToValidate.refreshToken) {
            const newToken = await refreshAccessToken(tokenToValidate.refreshToken)
            if (newToken) {
                await storeToken(newToken)
                return true
            }
        }

        console.log('[CodexAuth] Token refresh failed, re-authentication required')
        return false
    }

    return true
}

// ============================================================================
// OAuth Flow
// ============================================================================

let oauthServer: http.Server | null = null
let oauthWindow: BrowserWindow | null = null

/**
 * Start local server to receive OAuth callback
 */
function startOAuthServer(): Promise<OAuthCallbackData> {
    return new Promise((resolve, reject) => {
        // #region agent log
        console.log('[CodexAuth][DEBUG] Starting OAuth callback server on port', OAUTH_REDIRECT_PORT)
        // #endregion

        oauthServer = http.createServer((req, res) => {
            // #region agent log
            console.log('[CodexAuth][DEBUG] Received request:', req.method, req.url)
            console.log('[CodexAuth][DEBUG] Request headers:', JSON.stringify(req.headers, null, 2))
            // #endregion

            const parsedUrl = url.parse(req.url || '', true)

            // #region agent log
            console.log('[CodexAuth][DEBUG] Parsed pathname:', parsedUrl.pathname)
            console.log('[CodexAuth][DEBUG] Query params:', JSON.stringify(parsedUrl.query, null, 2))
            // #endregion

            if (parsedUrl.pathname === '/auth/callback') {
                const code = parsedUrl.query.code as string | undefined
                const error = parsedUrl.query.error as string | undefined
                const errorDescription = parsedUrl.query.error_description as string | undefined
                const state = parsedUrl.query.state as string | undefined

                // #region agent log
                console.log('[CodexAuth][DEBUG] Callback received - code:', code ? '[PRESENT]' : '[MISSING]')
                console.log('[CodexAuth][DEBUG] Callback received - error:', error || '[NONE]')
                console.log('[CodexAuth][DEBUG] Callback received - error_description:', errorDescription || '[NONE]')
                console.log('[CodexAuth][DEBUG] Callback received - state:', state ? '[PRESENT]' : '[MISSING]')
                // #endregion

                // Send response to browser
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end(`
                    <html>
                        <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: white;">
                            <div style="text-align: center;">
                                <h1>${error ? '❌ Authentication Failed' : '✅ Authentication Successful'}</h1>
                                <p>${error ? (errorDescription || error) : 'You can close this window and return to ZuraAI.'}</p>
                            </div>
                        </body>
                    </html>
                `)

                // Close server and resolve
                stopOAuthServer()

                if (error) {
                    reject(new Error(errorDescription || error))
                } else {
                    resolve({ code, state })
                }
            } else {
                // #region agent log
                console.log('[CodexAuth][DEBUG] Non-callback request, returning 404')
                // #endregion
                res.writeHead(404)
                res.end('Not found')
            }
        })

        oauthServer.listen(OAUTH_REDIRECT_PORT, () => {
            // #region agent log
            console.log(`[CodexAuth][DEBUG] OAuth callback server SUCCESSFULLY listening on port ${OAUTH_REDIRECT_PORT}`)
            console.log(`[CodexAuth][DEBUG] Waiting for callback at: ${OAUTH_REDIRECT_URI}`)
            // #endregion
        })

        oauthServer.on('error', (err: NodeJS.ErrnoException) => {
            // #region agent log
            console.error('[CodexAuth][DEBUG] OAuth server error:', err.code, err.message)
            if (err.code === 'EADDRINUSE') {
                console.error('[CodexAuth][DEBUG] Port', OAUTH_REDIRECT_PORT, 'is already in use!')
            }
            // #endregion
            reject(err)
        })

        // Timeout after 5 minutes
        setTimeout(() => {
            if (oauthServer) {
                stopOAuthServer()
                reject(new Error('OAuth timeout - no callback received'))
            }
        }, 5 * 60 * 1000)
    })
}

/**
 * Stop OAuth callback server
 */
function stopOAuthServer(): void {
    if (oauthServer) {
        oauthServer.close()
        oauthServer = null
    }
    if (oauthWindow && !oauthWindow.isDestroyed()) {
        oauthWindow.close()
        oauthWindow = null
    }
}

/**
 * Generate random state for OAuth (matches official Codex CLI)
 * Uses 32 bytes, base64url encoded without padding
 */
function generateState(): string {
    const crypto = require('crypto')
    const bytes = crypto.randomBytes(32)
    // Use base64url encoding without padding (matching Rust's URL_SAFE_NO_PAD)
    return bytes.toString('base64url')
}

/**
 * PKCE (Proof Key for Code Exchange) generation
 * Required for OpenAI OAuth - matches official Codex CLI implementation
 */
interface PKCEPair {
    verifier: string
    challenge: string
}

function generatePKCE(): PKCEPair {
    const crypto = require('crypto')

    // Generate a random code verifier using 64 bytes (matches Codex CLI)
    // URL-safe base64 without padding
    const verifier = crypto.randomBytes(64).toString('base64url')

    // Challenge (S256): BASE64URL-ENCODE(SHA256(verifier)) without padding
    const hash = crypto.createHash('sha256').update(verifier).digest()
    const challenge = hash.toString('base64url')

    return { verifier, challenge }
}

/**
 * Open OAuth window for ChatGPT login with PKCE
 * Returns both the authorization code and the PKCE verifier for token exchange
 */
export async function openOAuthWindow(): Promise<{ code: string; verifier: string }> {
    const state = generateState()
    const pkce = generatePKCE()

    console.log('[CodexAuth] Starting OAuth flow with PKCE...')
    console.log('[CodexAuth][DEBUG] Generated OAuth state:', state.substring(0, 10) + '...')

    // Build OAuth URL with PKCE and Codex CLI specific parameters
    const authUrl = new URL(OPENAI_AUTH_URL)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', OPENAI_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
    authUrl.searchParams.set('scope', OAUTH_SCOPE)
    authUrl.searchParams.set('code_challenge', pkce.challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    // Codex CLI specific parameters
    authUrl.searchParams.set('id_token_add_organizations', 'true')
    authUrl.searchParams.set('codex_cli_simplified_flow', 'true')
    authUrl.searchParams.set('originator', 'codex_cli_rs')

    console.log('[CodexAuth][DEBUG] OAuth URL built:')
    console.log('[CodexAuth][DEBUG]   - Auth endpoint:', OPENAI_AUTH_URL)
    console.log('[CodexAuth][DEBUG]   - Client ID:', OPENAI_CLIENT_ID)
    console.log('[CodexAuth][DEBUG]   - Redirect URI:', OAUTH_REDIRECT_URI)
    console.log('[CodexAuth][DEBUG]   - Scope:', OAUTH_SCOPE)
    console.log('[CodexAuth][DEBUG]   - PKCE challenge method: S256')
    console.log('[CodexAuth][DEBUG]   - Full URL:', authUrl.toString())

    // Start callback server
    const callbackPromise = startOAuthServer()

    // Open browser for authentication
    console.log('[CodexAuth] Opening browser for ChatGPT login...')
    await shell.openExternal(authUrl.toString())

    // Wait for callback
    console.log('[CodexAuth] Waiting for OAuth callback on port', OAUTH_REDIRECT_PORT, '...')
    const callbackData = await callbackPromise

    console.log('[CodexAuth][DEBUG] Callback received, verifying state...')

    // Verify state
    if (callbackData.state !== state) {
        console.error('[CodexAuth] State mismatch! Expected:', state.substring(0, 10) + '...', 'Got:', callbackData.state?.substring(0, 10) + '...')
        throw new Error('OAuth state mismatch - possible CSRF attack')
    }

    if (!callbackData.code) {
        console.error('[CodexAuth] No authorization code in callback!')
        throw new Error('No authorization code received')
    }

    console.log('[CodexAuth] OAuth flow successful, returning auth code and verifier')
    return { code: callbackData.code, verifier: pkce.verifier }
}

/**
 * Exchange authorization code for access token
 * @param authCode - The authorization code from OAuth callback
 * @param codeVerifier - The PKCE code verifier used to generate the challenge
 */
export async function exchangeCodeForToken(authCode: string, codeVerifier: string): Promise<CodexTokenData> {
    console.log('[CodexAuth] Exchanging auth code for token...')
    console.log('[CodexAuth][DEBUG] Token endpoint:', OPENAI_TOKEN_URL)

    const response = await fetch(OPENAI_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: OPENAI_CLIENT_ID,
            code: authCode,
            code_verifier: codeVerifier,  // PKCE verifier required
            redirect_uri: OAUTH_REDIRECT_URI
        })
    })

    console.log('[CodexAuth][DEBUG] Token exchange response status:', response.status, response.statusText)

    if (!response.ok) {
        const errorText = await response.text()
        console.error('[CodexAuth] Token exchange failed:', errorText)
        throw new Error(`Token exchange failed: ${errorText}`)
    }

    const tokenResponse = await response.json() as {
        id_token?: string
        access_token?: string
        refresh_token?: string
        expires_in?: number
    }

    console.log('[CodexAuth] Initial token exchange successful')
    console.log('[CodexAuth][DEBUG] Got id_token:', !!tokenResponse.id_token)
    console.log('[CodexAuth][DEBUG] Got access_token:', !!tokenResponse.access_token)
    console.log('[CodexAuth][DEBUG] Got refresh_token:', !!tokenResponse.refresh_token)

    // CRITICAL: Parse id_token to extract chatgpt_account_id
    // This is REQUIRED for API calls - the official Codex CLI sends it as ChatGPT-Account-ID header
    let chatgptAccountId: string | undefined
    let parsedEmail: string | undefined
    if (tokenResponse.id_token) {
        const idTokenClaims = parseIdToken(tokenResponse.id_token)
        chatgptAccountId = idTokenClaims.chatgptAccountId
        parsedEmail = idTokenClaims.email
        
        if (!chatgptAccountId) {
            console.warn('[CodexAuth] WARNING: No chatgpt_account_id in id_token - API calls may fail!')
            console.warn('[CodexAuth] This usually means you need to complete platform onboarding at platform.openai.com')
        }
    } else {
        console.warn('[CodexAuth] No id_token in response, cannot extract chatgpt_account_id')
    }

    // CRITICAL: Attempt to obtain API key via token exchange
    // This is what gives us the api.responses.write scope!
    // Reference: research-codex/codex/codex-rs/login/src/server.rs line 247-250
    let openaiApiKey: string | null = null
    if (tokenResponse.id_token) {
        openaiApiKey = await obtainApiKey(tokenResponse.id_token)
    }

    // Get user info using the access_token
    const userInfo = await getUserInfo(tokenResponse.access_token || '')

    const token: CodexTokenData = {
        // CRITICAL: Use openaiApiKey if available (has proper scopes), otherwise fall back to access_token
        // The official Codex CLI prefers openai_api_key when available (auth.rs line 456-460)
        accessToken: openaiApiKey || tokenResponse.access_token || '',
        openaiApiKey: openaiApiKey || undefined,
        refreshToken: tokenResponse.refresh_token,
        idToken: tokenResponse.id_token,
        chatgptAccountId: chatgptAccountId,  // CRITICAL: Required for API calls!
        expiresAt: Date.now() + (tokenResponse.expires_in || 3600) * 1000,
        userEmail: parsedEmail || userInfo.email || 'unknown',
        organization: userInfo.organization
    }

    console.log('[CodexAuth] Token created:')
    console.log('[CodexAuth]   email:', token.userEmail)
    console.log('[CodexAuth]   chatgptAccountId:', token.chatgptAccountId || 'MISSING!')
    console.log('[CodexAuth]   hasOpenaiApiKey:', !!token.openaiApiKey)
    console.log('[CodexAuth]   expires:', new Date(token.expiresAt).toISOString())

    return token
}

// ============================================================================
// API Request Helpers
// ============================================================================

/**
 * Select the appropriate authentication token for API requests
 * 
 * Token Selection Logic (Requirements 4.2, 4.3):
 * - Use openaiApiKey when available (has api.responses.write scope)
 * - Fall back to accessToken otherwise
 * 
 * @param token - The CodexTokenData containing available tokens
 * @returns The token string to use for Authorization header
 */
export function selectAuthToken(token: CodexTokenData): string {
    // Property 6: Token Selection
    // For any token data with both accessToken and openaiApiKey,
    // the API request SHALL use openaiApiKey when available,
    // falling back to accessToken otherwise.
    // Validates: Requirements 4.2, 4.3
    
    if (token.openaiApiKey && token.openaiApiKey.trim() !== '') {
        return token.openaiApiKey
    }
    return token.accessToken
}

/**
 * Make authenticated request to Codex API
 * CRITICAL: Includes ChatGPT-Account-ID header required by OpenAI API
 * 
 * Headers included (Requirements 3.1, 3.2, 3.3, 3.4):
 * - Authorization: Bearer {token} (using selectAuthToken for proper token selection)
 * - ChatGPT-Account-Id: {accountId} (when available)
 * - originator: codex_cli_rs
 * - User-Agent: codex_cli_rs/1.0.0 ZuraAI
 * - version: 1.0.0
 */
export async function makeCodexRequest(
    endpoint: string,
    method: string,
    body?: any
): Promise<Response> {
    // #region agent log - Entry point
    console.log('[CodexAuth:makeCodexRequest] ========== FUNCTION ENTRY ==========')
    console.log('[CodexAuth:makeCodexRequest] endpoint:', endpoint)
    console.log('[CodexAuth:makeCodexRequest] method:', method)
    // #endregion

    const token = await loadToken()

    if (!token) {
        console.error('[CodexAuth:makeCodexRequest] ERROR: No token found!')
        throw new Error('Not authenticated')
    }

    // Select the appropriate token for authentication (Requirements 4.2, 4.3)
    const authToken = selectAuthToken(token)

    // #region agent log - Token details
    console.log('[CodexAuth:makeCodexRequest] Token loaded:')
    console.log('[CodexAuth:makeCodexRequest]   accessToken prefix:', token.accessToken?.substring(0, 20) + '...')
    console.log('[CodexAuth:makeCodexRequest]   accessToken length:', token.accessToken?.length)
    console.log('[CodexAuth:makeCodexRequest]   hasOpenaiApiKey:', !!token.openaiApiKey)
    console.log('[CodexAuth:makeCodexRequest]   openaiApiKey prefix:', token.openaiApiKey?.substring(0, 20) + '...')
    console.log('[CodexAuth:makeCodexRequest]   selectedToken:', authToken === token.openaiApiKey ? 'openaiApiKey' : 'accessToken')
    console.log('[CodexAuth:makeCodexRequest]   chatgptAccountId:', token.chatgptAccountId)
    console.log('[CodexAuth:makeCodexRequest]   idToken present:', !!token.idToken)
    console.log('[CodexAuth:makeCodexRequest]   expiresAt:', new Date(token.expiresAt).toISOString())
    console.log('[CodexAuth:makeCodexRequest]   isExpired:', Date.now() >= token.expiresAt)
    // #endregion

    const isValid = await validateToken(token)
    if (!isValid) {
        console.error('[CodexAuth:makeCodexRequest] ERROR: Token validation failed!')
        throw new Error('Token expired or invalid')
    }

    const url = `${CODEX_API_BASE}${endpoint}`
    
    // #region agent log - URL construction
    console.log('[CodexAuth:makeCodexRequest] Full URL:', url)
    console.log('[CodexAuth:makeCodexRequest] CODEX_API_BASE:', CODEX_API_BASE)
    // #endregion

    // Build headers (Requirements 3.1, 3.2, 3.3, 3.4)
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${authToken}`,  // Requirement 3.1: Use selected token
        'Content-Type': 'application/json',
        'originator': 'codex_cli_rs',  // Requirement 3.3: Required by ChatGPT backend API
        'User-Agent': 'codex_cli_rs/1.0.0 ZuraAI',  // Requirement 3.4: Match Codex CLI format
        'version': '1.0.0'  // Requirement 3.4: Codex CLI version header
    }

    // CRITICAL: Add ChatGPT-Account-Id header - required for /v1/responses API (Requirement 3.2)
    // This is how the official Codex CLI authenticates
    if (token.chatgptAccountId) {
        headers['ChatGPT-Account-Id'] = token.chatgptAccountId
        // #region agent log
        console.log('[CodexAuth:makeCodexRequest] Adding ChatGPT-Account-Id header:', token.chatgptAccountId)
        // #endregion
    } else {
        console.warn('[CodexAuth:makeCodexRequest] WARNING: No chatgptAccountId - API call may fail!')
    }

    // #region agent log - All headers being sent
    console.log('[CodexAuth:makeCodexRequest] ========== REQUEST HEADERS ==========')
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === 'authorization') {
            console.log(`[CodexAuth:makeCodexRequest]   ${key}: Bearer ${value.substring(7, 27)}...`)
        } else {
            console.log(`[CodexAuth:makeCodexRequest]   ${key}: ${value}`)
        }
    }
    // #endregion

    const options: RequestInit = {
        method,
        headers
    }

    if (body) {
        options.body = JSON.stringify(body)
        // #region agent log - Request body analysis
        console.log('[CodexAuth:makeCodexRequest] ========== REQUEST BODY ANALYSIS ==========')
        console.log('[CodexAuth:makeCodexRequest] Body keys:', Object.keys(body))
        console.log('[CodexAuth:makeCodexRequest] model:', body.model)
        console.log('[CodexAuth:makeCodexRequest] instructions length:', body.instructions?.length)
        console.log('[CodexAuth:makeCodexRequest] instructions (first 200 chars):', body.instructions?.substring(0, 200))
        console.log('[CodexAuth:makeCodexRequest] input count:', body.input?.length)
        console.log('[CodexAuth:makeCodexRequest] tools:', JSON.stringify(body.tools))
        console.log('[CodexAuth:makeCodexRequest] tool_choice:', body.tool_choice)
        console.log('[CodexAuth:makeCodexRequest] parallel_tool_calls:', body.parallel_tool_calls)
        console.log('[CodexAuth:makeCodexRequest] stream:', body.stream)
        console.log('[CodexAuth:makeCodexRequest] store:', body.store)
        console.log('[CodexAuth:makeCodexRequest] include:', JSON.stringify(body.include))
        console.log('[CodexAuth:makeCodexRequest] reasoning:', JSON.stringify(body.reasoning))
        console.log('[CodexAuth:makeCodexRequest] HAS temperature?:', 'temperature' in body)
        console.log('[CodexAuth:makeCodexRequest] HAS max_tokens?:', 'max_tokens' in body)
        console.log('[CodexAuth:makeCodexRequest] FULL BODY JSON:', JSON.stringify(body, null, 2))
        // #endregion
    }

    // #region agent log - Making fetch call
    console.log('[CodexAuth:makeCodexRequest] ========== MAKING FETCH CALL ==========')
    console.log('[CodexAuth:makeCodexRequest] Calling fetch to:', url)
    // #endregion

    const response = await fetch(url, options)

    // #region agent log - Response received
    console.log('[CodexAuth:makeCodexRequest] ========== RESPONSE RECEIVED ==========')
    console.log('[CodexAuth:makeCodexRequest] Status:', response.status, response.statusText)
    console.log('[CodexAuth:makeCodexRequest] OK:', response.ok)
    console.log('[CodexAuth:makeCodexRequest] Response headers:')
    response.headers.forEach((value, key) => {
        console.log(`[CodexAuth:makeCodexRequest]   ${key}: ${value}`)
    })
    // #endregion

    return response
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map plan type to human-readable display name
 */
function mapPlanTypeToDisplayName(planType: string): string {
    const normalized = planType.toLowerCase()

    if (normalized.includes('pro')) {
        return 'ChatGPT Pro'
    } else if (normalized.includes('plus')) {
        return 'ChatGPT Plus'
    } else if (normalized.includes('team')) {
        return 'ChatGPT Team'
    } else if (normalized.includes('enterprise')) {
        return 'Enterprise'
    } else if (normalized.includes('edu') || normalized.includes('education')) {
        return 'Education'
    } else if (normalized === 'chatgpt') {
        return 'ChatGPT User'
    } else if (normalized === 'free' || normalized === 'none') {
        return 'Free'
    }

    // Return capitalized version if no match
    return planType.charAt(0).toUpperCase() + planType.slice(1).toLowerCase()
}

/**
 * Parse usage limit object from API response
 */
function parseUsageLimit(limitData: any): { used: number; total: number; resetAt?: number } | undefined {
    if (!limitData) return undefined

    // Handle different response structures
    if (typeof limitData === 'object') {
        let resetAt: number | undefined = undefined
        const resetAtValue = limitData.reset_at || limitData.resetAt || limitData.expires_at

        if (resetAtValue !== undefined && resetAtValue !== null) {
            // Handle Unix timestamp (seconds or milliseconds)
            if (typeof resetAtValue === 'number') {
                // If it's a timestamp, assume seconds if < 1e12, otherwise milliseconds
                resetAt = resetAtValue < 1e12 ? resetAtValue : Math.floor(resetAtValue / 1000)
            } else if (typeof resetAtValue === 'string') {
                // Try parsing as number first (Unix timestamp string)
                const parsed = Number(resetAtValue)
                if (!isNaN(parsed)) {
                    resetAt = parsed < 1e12 ? parsed : Math.floor(parsed / 1000)
                } else {
                    // Try parsing as ISO date string
                    const date = new Date(resetAtValue)
                    if (!isNaN(date.getTime())) {
                        resetAt = Math.floor(date.getTime() / 1000)
                    }
                }
            }
        }

        return {
            used: limitData.used || limitData.current_usage || limitData.usage || 0,
            total: limitData.total || limitData.limit || limitData.max || 0,
            resetAt
        }
    }

    return undefined
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Register all Codex auth IPC handlers
 */
export function registerCodexAuthHandlers(): void {
    // Initiate OAuth flow
    ipcMain.handle('codex:initiate-auth', async () => {
        try {
            console.log('[CodexAuth] Initiating OAuth flow...')

            const { code, verifier } = await openOAuthWindow()
            console.log('[CodexAuth] Got auth code, exchanging for token with PKCE verifier...')

            const token = await exchangeCodeForToken(code, verifier)
            console.log('[CodexAuth] Got token, storing...')

            const stored = await storeToken(token)
            if (!stored) {
                throw new Error('Failed to store token')
            }

            console.log('[CodexAuth] Authentication successful')
            return { success: true }
        } catch (error: any) {
            console.error('[CodexAuth] Authentication failed:', error)
            stopOAuthServer()
            return { success: false, error: error.message }
        }
    })

    // Get current auth state
    ipcMain.handle('codex:get-auth-state', async (): Promise<CodexAuthState> => {
        try {
            const token = await loadToken()

            if (!token) {
                return { isAuthenticated: false }
            }

            const isValid = await validateToken(token)

            return {
                isAuthenticated: isValid,
                userEmail: token.userEmail,
                expiresAt: token.expiresAt
            }
        } catch (error: any) {
            console.error('[CodexAuth] Failed to get auth state:', error)
            return { isAuthenticated: false, error: error.message }
        }
    })

    // Logout
    ipcMain.handle('codex:logout', async () => {
        try {
            await clearToken()
            console.log('[CodexAuth] Logged out successfully')
        } catch (error: any) {
            console.error('[CodexAuth] Logout failed:', error)
            throw error
        }
    })

    // Validate token
    ipcMain.handle('codex:validate-token', async (): Promise<boolean> => {
        try {
            return await validateToken()
        } catch (error) {
            console.error('[CodexAuth] Token validation failed:', error)
            return false
        }
    })

    // Send API request (for renderer process)
    ipcMain.handle('codex:send-request', async (_, { endpoint, method, body }) => {
        console.log('[CodexAuth:Request] ========== API REQUEST ==========')
        console.log('[CodexAuth:Request] Endpoint:', endpoint)
        console.log('[CodexAuth:Request] Method:', method)
        
        // #region agent log - Detailed input format logging
        if (body?.input) {
            console.log('[CodexAuth:Request] Input messages count:', body.input.length)
            body.input.forEach((item: any, idx: number) => {
                console.log(`[CodexAuth:Request] Input[${idx}]:`)
                console.log(`[CodexAuth:Request]   type: ${item.type}`)
                console.log(`[CodexAuth:Request]   role: ${item.role}`)
                console.log(`[CodexAuth:Request]   content type: ${Array.isArray(item.content) ? 'array' : typeof item.content}`)
                if (Array.isArray(item.content)) {
                    item.content.forEach((c: any, cidx: number) => {
                        console.log(`[CodexAuth:Request]   content[${cidx}].type: ${c.type}`)
                    })
                }
            })
        }
        console.log('[CodexAuth:Request] Instructions length:', body?.instructions?.length || 0)
        console.log('[CodexAuth:Request] Instructions preview:', body?.instructions?.substring(0, 100))
        // #endregion
        
        console.log('[CodexAuth:Request] Body:', JSON.stringify(body, null, 2))
        
        try {
            console.log('[CodexAuth:Request] Calling makeCodexRequest...')
            const response = await makeCodexRequest(endpoint, method, body)

            console.log('[CodexAuth:Request] Response received:')
            console.log('[CodexAuth:Request]   Status:', response.status, response.statusText)
            console.log('[CodexAuth:Request]   OK:', response.ok)

            // Capture rate limit headers from chat completion responses
            extractRateLimitHeaders(response.headers)

            // Convert response to serializable format
            const bodyText = await response.text()
            console.log('[CodexAuth:Request]   Body length:', bodyText.length)
            console.log('[CodexAuth:Request]   Body preview:', bodyText.substring(0, 500))

            const responseData = {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: bodyText
            }

            console.log('[CodexAuth:Request] ========== REQUEST COMPLETE ==========')
            return responseData
        } catch (error: any) {
            console.error('[CodexAuth:Request] ========== REQUEST ERROR ==========')
            console.error('[CodexAuth:Request] Error name:', error?.name)
            console.error('[CodexAuth:Request] Error message:', error?.message)
            console.error('[CodexAuth:Request] Error stack:', error?.stack)
            throw error
        }
    })

    // Fetch available models
    ipcMain.handle('codex:fetch-models', async () => {
        try {
            const token = await loadToken()
            if (!token) {
                return { success: false, error: 'Not authenticated', models: [] }
            }

            console.log('[CodexAuth] Returning official Codex CLI models with reasoning levels')

            // Return official Codex CLI models with reasoning effort levels
            // Reference: research-codex/codex/codex-rs/core/src/models_manager/model_presets.rs
            const models = [
                // GPT-5.2 Codex (default, latest frontier agentic coding model)
                {
                    code: 'gpt-5.2-codex-medium',
                    displayName: 'GPT-5.2 Codex',
                    description: 'Latest frontier agentic coding model (default)',
                    isDefault: true
                },
                {
                    code: 'gpt-5.2-codex-high',
                    displayName: 'GPT-5.2 Codex (High)',
                    description: 'Greater reasoning depth for complex problems'
                },
                {
                    code: 'gpt-5.2-codex-xhigh',
                    displayName: 'GPT-5.2 Codex (XHigh)',
                    description: 'Extra high reasoning for hardest tasks'
                },
                // GPT-5.1 Codex Max (flagship for deep and fast reasoning)
                {
                    code: 'gpt-5.1-codex-max-medium',
                    displayName: 'GPT-5.1 Codex Max',
                    description: 'Codex-optimized flagship for deep and fast reasoning'
                },
                {
                    code: 'gpt-5.1-codex-max-high',
                    displayName: 'GPT-5.1 Codex Max (High)',
                    description: 'Greater reasoning depth'
                },
                {
                    code: 'gpt-5.1-codex-max-xhigh',
                    displayName: 'GPT-5.1 Codex Max (XHigh)',
                    description: 'Maximum reasoning for hardest tasks'
                },
                // GPT-5.1 Codex Mini (cheaper, faster, but less capable)
                {
                    code: 'gpt-5.1-codex-mini-medium',
                    displayName: 'GPT-5.1 Codex Mini',
                    description: 'Cheaper, faster, but less capable'
                },
                {
                    code: 'gpt-5.1-codex-mini-high',
                    displayName: 'GPT-5.1 Codex Mini (High)',
                    description: 'Maximizes reasoning for complex problems'
                }
            ]

            return { success: true, models }
        } catch (error: any) {
            console.error('[CodexAuth] Error fetching models:', error)
            return { success: false, error: error.message, models: [] }
        }
    })

    // Check usage/billing information
    ipcMain.handle('codex:check-usage', async () => {
        try {
            const token = await loadToken()
            if (!token) {
                return { success: false, error: 'Not authenticated' }
            }

            console.log('[CodexAuth] Checking usage...')

            // Fetch user info from /v1/me endpoint (uses api.openai.com, not chatgpt.com)
            const meResponse = await fetch(`${OPENAI_API_BASE}/v1/me`, {
                headers: {
                    'Authorization': `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json'
                }
            })

            // #region agent log - Capture ALL response headers for rate limit analysis
            console.log('[CodexAuth][DEBUG] /v1/me response status:', meResponse.status)
            console.log('[CodexAuth][DEBUG] /v1/me ALL response headers:')
            meResponse.headers.forEach((value, key) => {
                console.log(`[CodexAuth][DEBUG]   ${key}: ${value}`)
            })
            // Extract rate limit headers specifically
            const rateLimitHeaders = {
                'x-ratelimit-limit-requests': meResponse.headers.get('x-ratelimit-limit-requests'),
                'x-ratelimit-limit-tokens': meResponse.headers.get('x-ratelimit-limit-tokens'),
                'x-ratelimit-remaining-requests': meResponse.headers.get('x-ratelimit-remaining-requests'),
                'x-ratelimit-remaining-tokens': meResponse.headers.get('x-ratelimit-remaining-tokens'),
                'x-ratelimit-reset-requests': meResponse.headers.get('x-ratelimit-reset-requests'),
                'x-ratelimit-reset-tokens': meResponse.headers.get('x-ratelimit-reset-tokens'),
            }
            console.log('[CodexAuth][DEBUG] Rate limit headers:', JSON.stringify(rateLimitHeaders, null, 2))
            // #endregion

            if (!meResponse.ok) {
                const errorText = await meResponse.text()
                console.error('[CodexAuth] Failed to fetch user info:', meResponse.status, errorText)
                return { success: false, error: `Failed to check usage: ${meResponse.status}` }
            }

            const userData = await meResponse.json()

            // #region agent log - Log COMPLETE raw response to understand actual structure
            console.log('[CodexAuth][DEBUG] /v1/me FULL RAW response:', JSON.stringify(userData, null, 2))
            console.log('[CodexAuth][DEBUG] /v1/me response keys (top level):', Object.keys(userData))
            // Deep inspection of nested objects
            for (const key of Object.keys(userData)) {
                const value = userData[key]
                if (typeof value === 'object' && value !== null) {
                    console.log(`[CodexAuth][DEBUG] /v1/me nested object "${key}" keys:`, Object.keys(value))
                    console.log(`[CodexAuth][DEBUG] /v1/me nested object "${key}" value:`, JSON.stringify(value, null, 2))
                }
            }
            // #endregion

            // Log full response for debugging
            console.log('[CodexAuth] /v1/me response keys:', Object.keys(userData))
            console.log('[CodexAuth] /v1/me response (sanitized):', JSON.stringify({
                email: userData.email,
                plan_type: userData.plan_type,
                plan: userData.plan,
                has_usage_limits: !!userData.usage_limits,
                has_limits: !!userData.limits,
                has_local: !!userData.local,
                has_cloud: !!userData.cloud
            }))

            // Map plan type to human-readable format
            // Note: /v1/me doesn't return plan_type for ChatGPT subscriptions
            // We try to infer from available data or default to showing account type
            let planType = userData.plan_type || userData.plan || 'chatgpt'
            let planDisplayName = mapPlanTypeToDisplayName(planType)

            // If plan is still showing as 'free' but user has orgs, they likely have a subscription
            // The /v1/me endpoint doesn't expose ChatGPT subscription tier
            if (planDisplayName === 'Free' && userData.orgs?.data?.length > 0) {
                // Check if any org suggests a paid plan
                const hasPersonalOrg = userData.orgs.data.some((org: any) => org.personal === true)
                if (hasPersonalOrg) {
                    planDisplayName = 'ChatGPT User'
                    planType = 'chatgpt'
                }
            }

            // Try to fetch usage limits - Codex/ChatGPT uses different endpoints
            let limits5Day: { used: number; total: number; resetAt?: number } | undefined
            let limits7Day: { used: number; total: number; resetAt?: number } | undefined

            // Check if usage info is in /v1/me response first
            if (userData.usage_limits || userData.limits || userData.local_usage || userData.cloud_usage) {
                const usageData = userData.usage_limits || userData.limits || userData
                console.log('[CodexAuth] Usage data found in /v1/me response:', JSON.stringify(usageData).substring(0, 300))

                // Try to parse from /v1/me response
                limits5Day = parseUsageLimit(usageData.local || usageData.local_usage || usageData['5_day'] || usageData.five_day)
                limits7Day = parseUsageLimit(usageData.cloud || usageData.cloud_usage || usageData['7_day'] || usageData.seven_day)
            }

            // If not found in /v1/me, try alternative endpoints
            if (!limits5Day && !limits7Day) {
                const endpointsToTry = [
                    '/v1/usage',
                    '/dashboard/api/billing/usage',
                    '/dashboard/api/usage',
                    '/api/usage'
                ]

                // #region agent log - Track which endpoints we try and their responses
                console.log('[CodexAuth][DEBUG] No usage limits found in /v1/me, trying alternative endpoints...')
                // #endregion

                for (const endpoint of endpointsToTry) {
                    try {
                        // #region agent log
                        // Use OPENAI_API_BASE for these endpoints (not CODEX_API_BASE)
                        console.log(`[CodexAuth][DEBUG] Trying endpoint: ${OPENAI_API_BASE}${endpoint}`)
                        // #endregion

                        const usageResponse = await fetch(`${OPENAI_API_BASE}${endpoint}`, {
                            headers: {
                                'Authorization': `Bearer ${token.accessToken}`,
                                'Content-Type': 'application/json'
                            }
                        })

                        // #region agent log - Log response status and headers for each endpoint
                        console.log(`[CodexAuth][DEBUG] ${endpoint} response status:`, usageResponse.status, usageResponse.statusText)
                        console.log(`[CodexAuth][DEBUG] ${endpoint} response headers:`)
                        usageResponse.headers.forEach((value, key) => {
                            console.log(`[CodexAuth][DEBUG]   ${key}: ${value}`)
                        })
                        // #endregion

                        if (usageResponse.ok) {
                            const usageData = await usageResponse.json()
                            // #region agent log - Log full response from successful endpoint
                            console.log(`[CodexAuth][DEBUG] ${endpoint} FULL response:`, JSON.stringify(usageData, null, 2))
                            // #endregion
                            console.log(`[CodexAuth] Usage data from ${endpoint}:`, JSON.stringify(usageData).substring(0, 300))

                            // Parse usage limits with various field name patterns
                            if (usageData.local || usageData.cloud) {
                                limits5Day = parseUsageLimit(usageData.local)
                                limits7Day = parseUsageLimit(usageData.cloud)
                            } else if (usageData.usage_limits) {
                                limits5Day = parseUsageLimit(usageData.usage_limits.local || usageData.usage_limits['5_day'] || usageData.usage_limits.five_day)
                                limits7Day = parseUsageLimit(usageData.usage_limits.cloud || usageData.usage_limits['7_day'] || usageData.usage_limits.seven_day)
                            } else if (usageData.limits) {
                                limits5Day = parseUsageLimit(usageData.limits.local || usageData.limits['5_day'] || usageData.limits.five_day)
                                limits7Day = parseUsageLimit(usageData.limits.cloud || usageData.limits['7_day'] || usageData.limits.seven_day)
                            } else if (usageData['5_day'] || usageData['7_day']) {
                                limits5Day = parseUsageLimit(usageData['5_day'])
                                limits7Day = parseUsageLimit(usageData['7_day'])
                            }

                            if (limits5Day || limits7Day) {
                                // #region agent log
                                console.log(`[CodexAuth][DEBUG] Successfully parsed limits from ${endpoint}:`, { limits5Day, limits7Day })
                                // #endregion
                                break // Found data, stop trying other endpoints
                            }
                        } else {
                            // #region agent log - Log failed endpoint responses
                            const errorBody = await usageResponse.text()
                            console.log(`[CodexAuth][DEBUG] ${endpoint} FAILED - status: ${usageResponse.status}, body: ${errorBody.substring(0, 200)}`)
                            // #endregion
                        }
                    } catch (endpointError: any) {
                        // #region agent log
                        console.log(`[CodexAuth][DEBUG] ${endpoint} ERROR:`, endpointError.message)
                        // #endregion
                        // Continue to next endpoint
                        continue
                    }
                }
            }

            // Extract relevant usage info
            const usageInfo = {
                email: userData.email,
                name: userData.name,
                picture: userData.picture,
                plan: planDisplayName,
                planType: planType,
                organization: userData.organization?.name || userData.organization?.id,
                created: userData.created,
                groups: userData.groups || [],
                limits5Day,
                limits7Day
            }

            // #region agent log - Log final usage info being returned
            console.log('[CodexAuth][DEBUG] FINAL usageInfo being returned:', JSON.stringify(usageInfo, null, 2))
            console.log('[CodexAuth][DEBUG] limits5Day:', limits5Day)
            console.log('[CodexAuth][DEBUG] limits7Day:', limits7Day)
            console.log('[CodexAuth][DEBUG] lastKnownRateLimits:', lastKnownRateLimits)
            // #endregion

            // Include rate limit data from last API call if available
            const rateLimits = lastKnownRateLimits.updatedAt ? {
                requests: lastKnownRateLimits.limitRequests && lastKnownRateLimits.remainingRequests !== undefined ? {
                    used: lastKnownRateLimits.limitRequests - lastKnownRateLimits.remainingRequests,
                    total: lastKnownRateLimits.limitRequests,
                    remaining: lastKnownRateLimits.remainingRequests,
                    resetIn: lastKnownRateLimits.resetRequests
                } : undefined,
                tokens: lastKnownRateLimits.limitTokens && lastKnownRateLimits.remainingTokens !== undefined ? {
                    used: lastKnownRateLimits.limitTokens - lastKnownRateLimits.remainingTokens,
                    total: lastKnownRateLimits.limitTokens,
                    remaining: lastKnownRateLimits.remainingTokens,
                    resetIn: lastKnownRateLimits.resetTokens
                } : undefined,
                updatedAt: lastKnownRateLimits.updatedAt
            } : undefined

            console.log('[CodexAuth] Usage info retrieved for:', usageInfo.email, 'Plan:', planDisplayName)
            return {
                success: true,
                usage: usageInfo,
                rateLimits,
                note: !rateLimits ? 'Rate limit data will be available after your first message. OpenAI only provides usage info in API response headers.' : undefined
            }
        } catch (error: any) {
            console.error('[CodexAuth] Error checking usage:', error)
            return { success: false, error: error.message }
        }
    })

    console.log('[CodexAuth] IPC handlers registered')
}

/**
 * Parse model code to extract base model and reasoning effort
 */
function parseModelCode(modelCode: string): { baseModel: string; reasoningEffort: string } {
    const efforts = ['xhigh', 'high', 'medium', 'low']
    for (const effort of efforts) {
        if (modelCode.endsWith(`-${effort}`)) {
            return {
                baseModel: modelCode.replace(`-${effort}`, ''),
                reasoningEffort: effort
            }
        }
    }
    return { baseModel: modelCode, reasoningEffort: 'medium' }
}

/**
 * Register streaming handler for Codex chat
 * This enables true SSE streaming from the Responses API
 */
export function registerCodexStreamingHandler(): void {
    console.log('[CodexAuth:Stream] Registering streaming handler...')
    
    ipcMain.handle('codex:stream-chat', async (event, { messages, model, options }) => {
        console.log('[CodexAuth:Stream] ========== STREAM REQUEST RECEIVED ==========')
        console.log('[CodexAuth:Stream] Model:', model)
        console.log('[CodexAuth:Stream] Messages count:', messages?.length)
        console.log('[CodexAuth:Stream] Options:', JSON.stringify(options, null, 2))

        // Step 1: Load token
        console.log('[CodexAuth:Stream] Step 1: Loading token...')
        const token = await loadToken()
        if (!token) {
            console.error('[CodexAuth:Stream] ERROR: No token found')
            throw new Error('Not authenticated')
        }
        console.log('[CodexAuth:Stream] Token loaded, email:', token.userEmail)

        // Step 2: Validate token
        console.log('[CodexAuth:Stream] Step 2: Validating token...')
        const isValid = await validateToken(token)
        if (!isValid) {
            console.error('[CodexAuth:Stream] ERROR: Token invalid or expired')
            throw new Error('Token expired or invalid')
        }
        console.log('[CodexAuth:Stream] Token valid')

        // Step 3: Parse model
        console.log('[CodexAuth:Stream] Step 3: Parsing model...')
        const { baseModel, reasoningEffort } = parseModelCode(model)
        const effectiveReasoningEffort = options?.reasoningEffort || reasoningEffort
        console.log('[CodexAuth:Stream] Base model:', baseModel, 'Reasoning:', effectiveReasoningEffort)

        // Step 4: Build request body
        // CRITICAL: ChatGPT backend API requires 'instructions' as top-level field
        // Extract system message and put it in 'instructions', rest goes in 'input'
        console.log('[CodexAuth:Stream] Step 4: Building request body...')
        
        // Extract system message for instructions field
        let instructions = ''
        const inputMessages: any[] = []
        
        for (const msg of messages) {
            if (msg.role === 'system') {
                // System message becomes the instructions
                instructions = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            } else {
                // Other messages go into input array
                inputMessages.push(msg)
            }
        }
        
        // If no system message found, use a default
        if (!instructions) {
            instructions = 'You are a helpful assistant.'
        }
        
        const requestBody: Record<string, any> = {
            model: baseModel,
            instructions: instructions,  // REQUIRED by ChatGPT backend API
            input: inputMessages,
            stream: true
        }

        if (effectiveReasoningEffort && effectiveReasoningEffort !== 'medium') {
            requestBody.reasoning = { effort: effectiveReasoningEffort }
            if (options?.reasoningSummary) {
                requestBody.reasoning.summary = options.reasoningSummary
            }
        }
        if (options?.temperature !== undefined) requestBody.temperature = options.temperature
        if (options?.maxTokens !== undefined) requestBody.max_output_tokens = options.maxTokens

        console.log('[CodexAuth:Stream] Request body:', JSON.stringify(requestBody, null, 2))

        // Step 5: Make fetch request
        // CRITICAL: For ChatGPT OAuth, the endpoint is /responses (not /v1/responses)
        // Base URL is https://chatgpt.com/backend-api/codex
        console.log('[CodexAuth:Stream] Step 5: Making fetch request to', `${CODEX_API_BASE}/responses`)
        
        // Select the appropriate token for authentication (Requirements 4.2, 4.3)
        const authToken = selectAuthToken(token)
        console.log('[CodexAuth:Stream] Selected token:', authToken === token.openaiApiKey ? 'openaiApiKey' : 'accessToken')
        
        // Build headers - CRITICAL: Include ChatGPT-Account-ID (Requirements 3.1, 3.2, 3.3, 3.4)
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${authToken}`,  // Requirement 3.1: Use selected token
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'originator': 'codex_cli_rs',  // Requirement 3.3
            'User-Agent': 'codex_cli_rs/1.0.0 ZuraAI',  // Requirement 3.4
            'version': '1.0.0'  // Requirement 3.4
        }
        
        // Requirement 3.2: Add ChatGPT-Account-Id header when available
        if (token.chatgptAccountId) {
            headers['ChatGPT-Account-Id'] = token.chatgptAccountId
            console.log('[CodexAuth:Stream] Adding ChatGPT-Account-Id:', token.chatgptAccountId)
        } else {
            console.warn('[CodexAuth:Stream] WARNING: No chatgptAccountId - request may fail!')
        }
        
        try {
            const response = await fetch(`${CODEX_API_BASE}/responses`, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            })

            console.log('[CodexAuth:Stream] Response status:', response.status, response.statusText)
            console.log('[CodexAuth:Stream] Response headers:')
            response.headers.forEach((value, key) => {
                console.log(`[CodexAuth:Stream]   ${key}: ${value}`)
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('[CodexAuth:Stream] ERROR: Request failed')
                console.error('[CodexAuth:Stream] Status:', response.status)
                console.error('[CodexAuth:Stream] Error body:', errorText)
                event.sender.send('codex:stream-error', { message: `API error ${response.status}: ${errorText}` })
                throw new Error(`Stream request failed: ${response.status} - ${errorText}`)
            }

            extractRateLimitHeaders(response.headers)

            // Step 6: Read stream
            console.log('[CodexAuth:Stream] Step 6: Reading response stream...')
            const reader = response.body?.getReader()
            if (!reader) {
                console.error('[CodexAuth:Stream] ERROR: No response body reader')
                throw new Error('No response body reader available')
            }

            const decoder = new TextDecoder()
            let buffer = ''
            let chunkCount = 0

            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    console.log('[CodexAuth:Stream] Stream ended, total chunks:', chunkCount)
                    break
                }

                const text = decoder.decode(value, { stream: true })
                buffer += text
                console.log('[CodexAuth:Stream] Received data chunk, buffer length:', buffer.length)

                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    const trimmedLine = line.trim()
                    if (trimmedLine.startsWith('data: ')) {
                        const data = trimmedLine.slice(6)
                        if (data === '[DONE]') {
                            console.log('[CodexAuth:Stream] Received [DONE] signal')
                            event.sender.send('codex:stream-done')
                            return { success: true }
                        }
                        try {
                            const parsed = JSON.parse(data)
                            chunkCount++
                            console.log('[CodexAuth:Stream] Parsed chunk #', chunkCount, 'type:', parsed.type)
                            event.sender.send('codex:stream-chunk', parsed)
                        } catch (parseError) {
                            console.warn('[CodexAuth:Stream] Failed to parse SSE chunk:', data.substring(0, 100))
                        }
                    }
                }
            }

            if (buffer.trim().startsWith('data: ')) {
                const data = buffer.trim().slice(6)
                if (data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data)
                        event.sender.send('codex:stream-chunk', parsed)
                    } catch { /* skip */ }
                }
            }

            console.log('[CodexAuth:Stream] ========== STREAM COMPLETE ==========')
            event.sender.send('codex:stream-done')
            return { success: true }

        } catch (error: any) {
            console.error('[CodexAuth:Stream] ========== STREAM ERROR ==========')
            console.error('[CodexAuth:Stream] Error name:', error?.name)
            console.error('[CodexAuth:Stream] Error message:', error?.message)
            console.error('[CodexAuth:Stream] Error stack:', error?.stack)
            event.sender.send('codex:stream-error', { message: error.message })
            throw error
        }
    })

    console.log('[CodexAuth] Streaming handler registered')
}

/**
 * Cleanup on app quit
 */
export function cleanupCodexAuth(): void {
    stopOAuthServer()
}
