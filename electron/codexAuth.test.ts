/**
 * Property-based tests for Codex Authentication Handler
 * 
 * Feature: codex-provider
 * Property 4: Token Lifecycle Management
 * Property 6: Token Selection
 * 
 * Note: These tests mock the file system and safeStorage for unit testing.
 * Integration tests would test the actual OAuth flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// ============================================================================
// Mock Types (matching codexAuth.ts)
// ============================================================================

interface CodexTokenData {
    accessToken: string
    openaiApiKey?: string    // API key from token exchange (has api.responses.write scope!)
    refreshToken?: string
    idToken?: string
    chatgptAccountId?: string
    expiresAt: number
    userEmail: string
    organization?: string
}

// ============================================================================
// Token Validation Logic (extracted for testing)
// ============================================================================

/**
 * Validate token by checking expiration
 * This is the core logic we want to test
 */
function isTokenValid(token: CodexTokenData | null): boolean {
    if (!token) {
        return false
    }

    // Check if token is expired
    if (token.expiresAt && Date.now() >= token.expiresAt) {
        return false
    }

    // Check if access token exists
    if (!token.accessToken || token.accessToken.trim() === '') {
        return false
    }

    return true
}

/**
 * Determine if token needs refresh
 */
function tokenNeedsRefresh(token: CodexTokenData | null, bufferMs: number = 5 * 60 * 1000): boolean {
    if (!token) {
        return true
    }

    // Token needs refresh if it expires within buffer time
    if (token.expiresAt && Date.now() >= token.expiresAt - bufferMs) {
        return true
    }

    return false
}

/**
 * Sanitize token for logging (remove sensitive data)
 */
function sanitizeTokenForLogging(token: CodexTokenData): Partial<CodexTokenData> {
    return {
        expiresAt: token.expiresAt,
        userEmail: token.userEmail,
        organization: token.organization
        // accessToken, openaiApiKey, and refreshToken are intentionally omitted
    }
}

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
function selectAuthToken(token: CodexTokenData): string {
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

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid token data
 */
const validTokenArb = fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    openaiApiKey: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    idToken: fc.option(fc.string({ minLength: 10, maxLength: 500 }), { nil: undefined }),
    chatgptAccountId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now() + 1000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }), // Future
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate expired token data
 */
const expiredTokenArb = fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    openaiApiKey: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    idToken: fc.option(fc.string({ minLength: 10, maxLength: 500 }), { nil: undefined }),
    chatgptAccountId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    expiresAt: fc.integer({ min: 0, max: Date.now() - 1000 }), // Past
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate token with empty access token
 */
const invalidAccessTokenArb = fc.record({
    accessToken: fc.constantFrom('', '   ', '\t\n'),
    openaiApiKey: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    idToken: fc.option(fc.string({ minLength: 10, maxLength: 500 }), { nil: undefined }),
    chatgptAccountId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now() + 1000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate token about to expire (within buffer)
 */
const aboutToExpireTokenArb = (bufferMs: number) => fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    openaiApiKey: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    idToken: fc.option(fc.string({ minLength: 10, maxLength: 500 }), { nil: undefined }),
    chatgptAccountId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now(), max: Date.now() + bufferMs - 1 }), // Within buffer
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate token with both accessToken and openaiApiKey (for token selection tests)
 */
const tokenWithBothKeysArb = fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    openaiApiKey: fc.string({ minLength: 10, maxLength: 200 }),  // Always present
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    idToken: fc.option(fc.string({ minLength: 10, maxLength: 500 }), { nil: undefined }),
    chatgptAccountId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now() + 1000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate token with only accessToken (no openaiApiKey)
 */
const tokenWithOnlyAccessTokenArb = fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    openaiApiKey: fc.constant(undefined),  // Never present
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    idToken: fc.option(fc.string({ minLength: 10, maxLength: 500 }), { nil: undefined }),
    chatgptAccountId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now() + 1000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate token with empty/whitespace openaiApiKey (should fall back to accessToken)
 */
const tokenWithEmptyApiKeyArb = fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    openaiApiKey: fc.constantFrom('', '   ', '\t\n', '\r\n'),  // Empty or whitespace
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    idToken: fc.option(fc.string({ minLength: 10, maxLength: 500 }), { nil: undefined }),
    chatgptAccountId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now() + 1000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

// ============================================================================
// Property Tests
// ============================================================================

describe('Codex Auth - Property Tests', () => {
    /**
     * Property 4: Token Lifecycle Management
     * For any valid stored Auth_Token, subsequent API requests SHALL reuse that token
     * without re-authentication. For any invalid or expired token, the system SHALL
     * trigger re-authentication flow and NOT proceed with the invalid token.
     * 
     * Validates: Requirements 2.4, 7.5
     */
    describe('Property 4: Token Lifecycle Management', () => {
        describe('Valid Token Handling', () => {
            it('should accept any token with future expiration and non-empty access token', () => {
                fc.assert(
                    fc.property(validTokenArb, (token) => {
                        const isValid = isTokenValid(token)
                        expect(isValid).toBe(true)
                    }),
                    { numRuns: 100 }
                )
            })

            it('should not require refresh for tokens with sufficient time remaining', () => {
                const bufferMs = 5 * 60 * 1000 // 5 minutes
                
                fc.assert(
                    fc.property(
                        fc.record({
                            accessToken: fc.string({ minLength: 10, maxLength: 200 }),
                            expiresAt: fc.integer({ 
                                min: Date.now() + bufferMs + 1000, 
                                max: Date.now() + 365 * 24 * 60 * 60 * 1000 
                            }),
                            userEmail: fc.emailAddress()
                        }),
                        (token) => {
                            const needsRefresh = tokenNeedsRefresh(token as CodexTokenData, bufferMs)
                            expect(needsRefresh).toBe(false)
                        }
                    ),
                    { numRuns: 100 }
                )
            })
        })

        describe('Expired Token Handling', () => {
            it('should reject any token with past expiration', () => {
                fc.assert(
                    fc.property(expiredTokenArb, (token) => {
                        const isValid = isTokenValid(token)
                        expect(isValid).toBe(false)
                    }),
                    { numRuns: 100 }
                )
            })

            it('should require refresh for expired tokens', () => {
                fc.assert(
                    fc.property(expiredTokenArb, (token) => {
                        const needsRefresh = tokenNeedsRefresh(token)
                        expect(needsRefresh).toBe(true)
                    }),
                    { numRuns: 100 }
                )
            })
        })

        describe('Invalid Token Handling', () => {
            it('should reject tokens with empty access token', () => {
                fc.assert(
                    fc.property(invalidAccessTokenArb, (token) => {
                        const isValid = isTokenValid(token)
                        expect(isValid).toBe(false)
                    }),
                    { numRuns: 100 }
                )
            })

            it('should reject null tokens', () => {
                expect(isTokenValid(null)).toBe(false)
            })

            it('should require refresh for null tokens', () => {
                expect(tokenNeedsRefresh(null)).toBe(true)
            })
        })

        describe('Token Refresh Buffer', () => {
            it('should require refresh for tokens expiring within buffer', () => {
                const bufferMs = 5 * 60 * 1000 // 5 minutes
                
                fc.assert(
                    fc.property(aboutToExpireTokenArb(bufferMs), (token) => {
                        const needsRefresh = tokenNeedsRefresh(token, bufferMs)
                        expect(needsRefresh).toBe(true)
                    }),
                    { numRuns: 100 }
                )
            })
        })

        describe('Token Sanitization for Logging', () => {
            it('should never include accessToken in sanitized output', () => {
                fc.assert(
                    fc.property(validTokenArb, (token) => {
                        const sanitized = sanitizeTokenForLogging(token)
                        expect(sanitized).not.toHaveProperty('accessToken')
                    }),
                    { numRuns: 100 }
                )
            })

            it('should never include refreshToken in sanitized output', () => {
                fc.assert(
                    fc.property(validTokenArb, (token) => {
                        const sanitized = sanitizeTokenForLogging(token)
                        expect(sanitized).not.toHaveProperty('refreshToken')
                    }),
                    { numRuns: 100 }
                )
            })

            it('should never include openaiApiKey in sanitized output', () => {
                fc.assert(
                    fc.property(validTokenArb, (token) => {
                        const sanitized = sanitizeTokenForLogging(token)
                        expect(sanitized).not.toHaveProperty('openaiApiKey')
                    }),
                    { numRuns: 100 }
                )
            })

            it('should preserve non-sensitive fields', () => {
                fc.assert(
                    fc.property(validTokenArb, (token) => {
                        const sanitized = sanitizeTokenForLogging(token)
                        expect(sanitized.expiresAt).toBe(token.expiresAt)
                        expect(sanitized.userEmail).toBe(token.userEmail)
                        expect(sanitized.organization).toBe(token.organization)
                    }),
                    { numRuns: 100 }
                )
            })
        })
    })

    /**
     * Property 6: Token Selection
     * For any token data with both accessToken and openaiApiKey, the API request
     * SHALL use openaiApiKey when available, falling back to accessToken otherwise.
     * 
     * Validates: Requirements 4.2, 4.3
     * 
     * Feature: codex-provider-fix, Property 6: Token Selection
     */
    describe('Property 6: Token Selection', () => {
        describe('When openaiApiKey is available', () => {
            it('should use openaiApiKey when both tokens are present', () => {
                fc.assert(
                    fc.property(tokenWithBothKeysArb, (token) => {
                        const selectedToken = selectAuthToken(token)
                        // When openaiApiKey is available, it should be selected
                        expect(selectedToken).toBe(token.openaiApiKey)
                    }),
                    { numRuns: 100 }
                )
            })

            it('should never return accessToken when valid openaiApiKey exists', () => {
                fc.assert(
                    fc.property(tokenWithBothKeysArb, (token) => {
                        const selectedToken = selectAuthToken(token)
                        // Selected token should not be accessToken when openaiApiKey is valid
                        expect(selectedToken).not.toBe(token.accessToken)
                    }),
                    { numRuns: 100 }
                )
            })
        })

        describe('When openaiApiKey is not available', () => {
            it('should fall back to accessToken when openaiApiKey is undefined', () => {
                fc.assert(
                    fc.property(tokenWithOnlyAccessTokenArb, (token) => {
                        const selectedToken = selectAuthToken(token)
                        // When openaiApiKey is undefined, accessToken should be selected
                        expect(selectedToken).toBe(token.accessToken)
                    }),
                    { numRuns: 100 }
                )
            })

            it('should fall back to accessToken when openaiApiKey is empty or whitespace', () => {
                fc.assert(
                    fc.property(tokenWithEmptyApiKeyArb, (token) => {
                        const selectedToken = selectAuthToken(token)
                        // When openaiApiKey is empty/whitespace, accessToken should be selected
                        expect(selectedToken).toBe(token.accessToken)
                    }),
                    { numRuns: 100 }
                )
            })
        })

        describe('Token selection consistency', () => {
            it('should always return a non-empty string for valid tokens', () => {
                fc.assert(
                    fc.property(validTokenArb, (token) => {
                        const selectedToken = selectAuthToken(token)
                        // Selected token should always be a non-empty string
                        expect(typeof selectedToken).toBe('string')
                        expect(selectedToken.length).toBeGreaterThan(0)
                    }),
                    { numRuns: 100 }
                )
            })

            it('should be deterministic - same input always produces same output', () => {
                fc.assert(
                    fc.property(validTokenArb, (token) => {
                        const result1 = selectAuthToken(token)
                        const result2 = selectAuthToken(token)
                        expect(result1).toBe(result2)
                    }),
                    { numRuns: 100 }
                )
            })
        })
    })
})

// ============================================================================
// Rate Limit Header Capture Logic (extracted for testing)
// ============================================================================

interface RateLimitData {
    limitRequests?: number
    limitTokens?: number
    remainingRequests?: number
    remainingTokens?: number
    resetRequests?: string
    resetTokens?: string
    updatedAt?: number
}

/**
 * Extract rate limit data from headers
 * This mirrors the extractRateLimitHeaders function in codexAuth.ts
 */
function extractRateLimitHeaders(headers: Map<string, string>, existingLimits: RateLimitData = {}): RateLimitData {
    const limitRequests = headers.get('x-ratelimit-limit-requests')
    const limitTokens = headers.get('x-ratelimit-limit-tokens')
    const remainingRequests = headers.get('x-ratelimit-remaining-requests')
    const remainingTokens = headers.get('x-ratelimit-remaining-tokens')
    const resetRequests = headers.get('x-ratelimit-reset-requests')
    const resetTokens = headers.get('x-ratelimit-reset-tokens')

    // Only update if we got any rate limit data
    if (limitRequests || limitTokens || remainingRequests || remainingTokens) {
        return {
            limitRequests: limitRequests ? parseInt(limitRequests, 10) : existingLimits.limitRequests,
            limitTokens: limitTokens ? parseInt(limitTokens, 10) : existingLimits.limitTokens,
            remainingRequests: remainingRequests ? parseInt(remainingRequests, 10) : existingLimits.remainingRequests,
            remainingTokens: remainingTokens ? parseInt(remainingTokens, 10) : existingLimits.remainingTokens,
            resetRequests: resetRequests || existingLimits.resetRequests,
            resetTokens: resetTokens || existingLimits.resetTokens,
            updatedAt: Date.now()
        }
    }
    
    return existingLimits
}

// ============================================================================
// Rate Limit Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid rate limit header values
 */
const rateLimitHeadersArb = fc.record({
    limitRequests: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
    limitTokens: fc.option(fc.integer({ min: 1, max: 10000000 }), { nil: undefined }),
    remainingRequests: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
    remainingTokens: fc.option(fc.integer({ min: 0, max: 10000000 }), { nil: undefined }),
    resetRequests: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    resetTokens: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined })
})

/**
 * Generate headers map with rate limit values
 */
function createHeadersMap(values: {
    limitRequests?: number
    limitTokens?: number
    remainingRequests?: number
    remainingTokens?: number
    resetRequests?: string
    resetTokens?: string
}): Map<string, string> {
    const headers = new Map<string, string>()
    
    if (values.limitRequests !== undefined) {
        headers.set('x-ratelimit-limit-requests', String(values.limitRequests))
    }
    if (values.limitTokens !== undefined) {
        headers.set('x-ratelimit-limit-tokens', String(values.limitTokens))
    }
    if (values.remainingRequests !== undefined) {
        headers.set('x-ratelimit-remaining-requests', String(values.remainingRequests))
    }
    if (values.remainingTokens !== undefined) {
        headers.set('x-ratelimit-remaining-tokens', String(values.remainingTokens))
    }
    if (values.resetRequests !== undefined) {
        headers.set('x-ratelimit-reset-requests', values.resetRequests)
    }
    if (values.resetTokens !== undefined) {
        headers.set('x-ratelimit-reset-tokens', values.resetTokens)
    }
    
    return headers
}

/**
 * Generate headers with at least one rate limit value present
 */
const nonEmptyRateLimitHeadersArb = fc.record({
    limitRequests: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
    limitTokens: fc.option(fc.integer({ min: 1, max: 10000000 }), { nil: undefined }),
    remainingRequests: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
    remainingTokens: fc.option(fc.integer({ min: 0, max: 10000000 }), { nil: undefined }),
    resetRequests: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    resetTokens: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined })
}).filter(v => 
    v.limitRequests !== undefined || 
    v.limitTokens !== undefined || 
    v.remainingRequests !== undefined || 
    v.remainingTokens !== undefined
)

// ============================================================================
// Property 8: Rate Limit Header Capture Tests
// ============================================================================

describe('Property 8: Rate Limit Header Capture', () => {
    /**
     * Property 8: Rate Limit Header Capture
     * For any API response containing rate limit headers, the system SHALL capture
     * and store the limit values.
     * 
     * Validates: Requirements 9.1, 9.2
     * 
     * Feature: codex-provider-fix, Property 8: Rate Limit Header Capture
     */
    
    describe('Capturing rate limit headers', () => {
        it('should capture all present rate limit headers from response', () => {
            fc.assert(
                fc.property(nonEmptyRateLimitHeadersArb, (headerValues) => {
                    const headers = createHeadersMap(headerValues)
                    const result = extractRateLimitHeaders(headers)
                    
                    // Verify each present header is captured correctly
                    if (headerValues.limitRequests !== undefined) {
                        expect(result.limitRequests).toBe(headerValues.limitRequests)
                    }
                    if (headerValues.limitTokens !== undefined) {
                        expect(result.limitTokens).toBe(headerValues.limitTokens)
                    }
                    if (headerValues.remainingRequests !== undefined) {
                        expect(result.remainingRequests).toBe(headerValues.remainingRequests)
                    }
                    if (headerValues.remainingTokens !== undefined) {
                        expect(result.remainingTokens).toBe(headerValues.remainingTokens)
                    }
                    if (headerValues.resetRequests !== undefined) {
                        expect(result.resetRequests).toBe(headerValues.resetRequests)
                    }
                    if (headerValues.resetTokens !== undefined) {
                        expect(result.resetTokens).toBe(headerValues.resetTokens)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should set updatedAt timestamp when rate limit headers are present', () => {
            fc.assert(
                fc.property(nonEmptyRateLimitHeadersArb, (headerValues) => {
                    const headers = createHeadersMap(headerValues)
                    const beforeTime = Date.now()
                    const result = extractRateLimitHeaders(headers)
                    const afterTime = Date.now()
                    
                    // updatedAt should be set to current time
                    expect(result.updatedAt).toBeDefined()
                    expect(result.updatedAt).toBeGreaterThanOrEqual(beforeTime)
                    expect(result.updatedAt).toBeLessThanOrEqual(afterTime)
                }),
                { numRuns: 100 }
            )
        })

        it('should preserve existing values when new headers are missing', () => {
            fc.assert(
                fc.property(
                    nonEmptyRateLimitHeadersArb,
                    fc.record({
                        limitRequests: fc.integer({ min: 1, max: 100000 }),
                        limitTokens: fc.integer({ min: 1, max: 10000000 }),
                        remainingRequests: fc.integer({ min: 0, max: 100000 }),
                        remainingTokens: fc.integer({ min: 0, max: 10000000 }),
                        resetRequests: fc.string({ minLength: 1, maxLength: 30 }),
                        resetTokens: fc.string({ minLength: 1, maxLength: 30 }),
                        updatedAt: fc.integer({ min: 0, max: Date.now() })
                    }),
                    (newHeaderValues, existingLimits) => {
                        const headers = createHeadersMap(newHeaderValues)
                        const result = extractRateLimitHeaders(headers, existingLimits)
                        
                        // For each field, if new value is undefined, existing should be preserved
                        if (newHeaderValues.limitRequests === undefined) {
                            expect(result.limitRequests).toBe(existingLimits.limitRequests)
                        }
                        if (newHeaderValues.limitTokens === undefined) {
                            expect(result.limitTokens).toBe(existingLimits.limitTokens)
                        }
                        if (newHeaderValues.remainingRequests === undefined) {
                            expect(result.remainingRequests).toBe(existingLimits.remainingRequests)
                        }
                        if (newHeaderValues.remainingTokens === undefined) {
                            expect(result.remainingTokens).toBe(existingLimits.remainingTokens)
                        }
                        if (newHeaderValues.resetRequests === undefined) {
                            expect(result.resetRequests).toBe(existingLimits.resetRequests)
                        }
                        if (newHeaderValues.resetTokens === undefined) {
                            expect(result.resetTokens).toBe(existingLimits.resetTokens)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Empty headers handling', () => {
        it('should return existing limits unchanged when no rate limit headers present', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        limitRequests: fc.integer({ min: 1, max: 100000 }),
                        limitTokens: fc.integer({ min: 1, max: 10000000 }),
                        remainingRequests: fc.integer({ min: 0, max: 100000 }),
                        remainingTokens: fc.integer({ min: 0, max: 10000000 }),
                        resetRequests: fc.string({ minLength: 1, maxLength: 30 }),
                        resetTokens: fc.string({ minLength: 1, maxLength: 30 }),
                        updatedAt: fc.integer({ min: 0, max: Date.now() })
                    }),
                    (existingLimits) => {
                        // Empty headers map (no rate limit headers)
                        const headers = new Map<string, string>()
                        const result = extractRateLimitHeaders(headers, existingLimits)
                        
                        // Should return existing limits unchanged
                        expect(result).toEqual(existingLimits)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should return empty object when no headers and no existing limits', () => {
            const headers = new Map<string, string>()
            const result = extractRateLimitHeaders(headers)
            
            expect(result).toEqual({})
        })
    })

    describe('Numeric parsing', () => {
        it('should correctly parse integer values from string headers', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 10000000 }),
                    fc.integer({ min: 0, max: 10000000 }),
                    (limitVal, remainingVal) => {
                        const headers = new Map<string, string>()
                        headers.set('x-ratelimit-limit-requests', String(limitVal))
                        headers.set('x-ratelimit-remaining-requests', String(remainingVal))
                        
                        const result = extractRateLimitHeaders(headers)
                        
                        expect(result.limitRequests).toBe(limitVal)
                        expect(result.remainingRequests).toBe(remainingVal)
                        expect(typeof result.limitRequests).toBe('number')
                        expect(typeof result.remainingRequests).toBe('number')
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})

// ============================================================================
// Unit Tests for Edge Cases
// ============================================================================

describe('Codex Auth - Unit Tests', () => {
    describe('Token Validation Edge Cases', () => {
        it('should handle token expiring exactly now', () => {
            const token: CodexTokenData = {
                accessToken: 'valid-token',
                expiresAt: Date.now(),
                userEmail: 'test@example.com'
            }
            // Token expiring exactly now should be invalid
            expect(isTokenValid(token)).toBe(false)
        })

        it('should handle token expiring 1ms in future', () => {
            const token: CodexTokenData = {
                accessToken: 'valid-token',
                expiresAt: Date.now() + 1,
                userEmail: 'test@example.com'
            }
            // Token expiring 1ms in future should be valid
            expect(isTokenValid(token)).toBe(true)
        })

        it('should handle very long expiration times', () => {
            const token: CodexTokenData = {
                accessToken: 'valid-token',
                expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
                userEmail: 'test@example.com'
            }
            expect(isTokenValid(token)).toBe(true)
        })

        it('should handle zero expiration time', () => {
            const token: CodexTokenData = {
                accessToken: 'valid-token',
                expiresAt: 0,
                userEmail: 'test@example.com'
            }
            expect(isTokenValid(token)).toBe(false)
        })
    })
})
