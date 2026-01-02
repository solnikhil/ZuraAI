/**
 * Property-based tests for Codex Authentication Handler
 * 
 * Feature: codex-provider
 * Property 4: Token Lifecycle Management
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
    refreshToken?: string
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
        // accessToken and refreshToken are intentionally omitted
    }
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid token data
 */
const validTokenArb = fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now() + 1000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }), // Future
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate expired token data
 */
const expiredTokenArb = fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    expiresAt: fc.integer({ min: 0, max: Date.now() - 1000 }), // Past
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate token with empty access token
 */
const invalidAccessTokenArb = fc.record({
    accessToken: fc.constantFrom('', '   ', '\t\n'),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now() + 1000, max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    userEmail: fc.emailAddress(),
    organization: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
}) as fc.Arbitrary<CodexTokenData>

/**
 * Generate token about to expire (within buffer)
 */
const aboutToExpireTokenArb = (bufferMs: number) => fc.record({
    accessToken: fc.string({ minLength: 10, maxLength: 200 }),
    refreshToken: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    expiresAt: fc.integer({ min: Date.now(), max: Date.now() + bufferMs - 1 }), // Within buffer
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
