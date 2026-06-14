// Terminal skill (system_shell) execution constants.
//
// The terminal path allows a higher timeout cap than other native Windows
// tools (which stay at MAX_NATIVE_TIMEOUT_MS = 60s) because builds, installs,
// and long-running scripts commonly need more time. Output is still truncated
// by the shared truncateOutput helper.
export const TERMINAL_MAX_TIMEOUT_MS = 300_000
export const TERMINAL_DEFAULT_TIMEOUT_MS = 15_000

// How long the approval prompt stays pending before auto-rejecting.
export const TERMINAL_APPROVAL_TIMEOUT_MS = 60_000
