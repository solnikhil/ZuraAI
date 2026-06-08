// Credential resolution for web-search providers.
//
// Resolves a provider's secret from `electron/secureStorage.ts` using the
// provider's `credentialKey`. This module is the single seam between the
// orchestrator and secure storage for web-search credentials.
//
// Requirement 5.1: read the provider secret from secure storage and resolve to
//   the stored string or an absent value (`null`).
// Requirement 5.4: a read failure must NOT crash the orchestrator. Because the
//   design signature returns `Promise<string | null>`, an absent credential is
//   represented as `null`, while a genuine read failure is surfaced as a typed
//   `CredentialReadError` so the orchestrator can distinguish "absent" from
//   "could not be read" and produce the correct user-facing error.

import { getSecureValueAsync } from '../../secureStorage'
import type { SecureStorageKey } from './types'

/**
 * Thrown when reading a provider secret from secure storage fails. The
 * orchestrator detects this via `instanceof` and surfaces a
 * "credential could not be read" error instead of treating the credential as
 * absent.
 */
export class CredentialReadError extends Error {
  readonly cause?: unknown

  constructor(key: SecureStorageKey, cause?: unknown) {
    super(`Failed to read secure storage credential for "${key}".`)
    this.name = 'CredentialReadError'
    this.cause = cause
  }
}

/**
 * Resolve a provider's secret from secure storage.
 *
 * @param key - The provider's secure-storage credential key (e.g. `tavilyApiKey`).
 * @returns The trimmed secret string when present, or `null` when absent/empty.
 * @throws {CredentialReadError} When reading the secret from secure storage throws.
 */
export async function resolveProviderCredential(key: SecureStorageKey): Promise<string | null> {
  let value: string
  try {
    // `getSecureValueAsync` already swallows internal read/decrypt errors and
    // returns '' when absent, so this catch is defensive. If it ever throws, we
    // surface a typed read failure rather than masking it as an absent value.
    value = await getSecureValueAsync(key)
  } catch (error) {
    throw new CredentialReadError(key, error)
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
