/**
 * Discord Rich Presence types shared between main-process client and renderer.
 */

export interface DiscordRpcSettings {
  appId: string
}

export interface DiscordRpcState {
  connected: boolean
  missingAppId: boolean
  lastError?: string
}

export interface DiscordRpcActivity {
  state?: string
  details?: string
  startTimestamp?: number
  endTimestamp?: number
  largeImageKey?: string
  largeImageText?: string
  smallImageKey?: string
  smallImageText?: string
  partyId?: string
  partySize?: number
  partyMax?: number
  matchSecret?: string
  joinSecret?: string
  spectateSecret?: string
  buttons?: { label: string; url: string }[]
}
