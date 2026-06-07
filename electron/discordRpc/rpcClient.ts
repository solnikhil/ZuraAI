/**
 * Discord Rich Presence client — main-process singleton.
 *
 * Manages the lifecycle of the Discord RPC connection, reconnects with
 * backoff when Discord is not running, and surfaces connection state to
 * the renderer via IPC broadcasts.
 */

import type { Client } from 'discord-rpc'
import type { DiscordRpcActivity, DiscordRpcState } from './types'

const RECONNECT_INTERVAL_MS = 15000
const CONNECT_TIMEOUT_MS = 10000
const DEFAULT_APP_ID = '1512516130911162610'

let singleton: DiscordRpcClient | null = null

export function getDiscordRpcClient(): DiscordRpcClient {
  if (!singleton) {
    singleton = new DiscordRpcClient()
  }
  return singleton
}

export function disposeDiscordRpcClient(): void {
  if (singleton) {
    singleton.dispose()
    singleton = null
  }
}

class DiscordRpcClient {
  private client: Client | null = null
  private appId: string = DEFAULT_APP_ID
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private currentActivity: DiscordRpcActivity | null = null
  private state: DiscordRpcState = {
    connected: false,
    missingAppId: false,
  }
  private listeners: Set<(state: DiscordRpcState) => void> = new Set()
  private isDisposed = false

  constructor() {
    // Always-on: attempt to connect immediately if appId is present.
    void this.connect()
  }

  setAppId(appId: string): void {
    if (this.isDisposed) return
    const trimmed = appId.trim()
    if (trimmed === this.appId) return
    this.appId = trimmed || DEFAULT_APP_ID
    console.log('[DiscordRpcClient] App ID changed, reconnecting...')
    this.disconnect('app-id-changed')
    void this.connect()
  }

  setActivity(activity: DiscordRpcActivity): void {
    if (this.isDisposed) return
    this.currentActivity = { ...activity }
    if (this.client && this.state.connected) {
      this.client.setActivity(this.normalizeActivity(activity)).catch((err: unknown) => {
        console.warn('[DiscordRpcClient] setActivity failed:', err)
      })
    }
  }

  getState(): DiscordRpcState {
    return { ...this.state }
  }

  onStateChange(listener: (state: DiscordRpcState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  offStateChange(listener: (state: DiscordRpcState) => void): void {
    this.listeners.delete(listener)
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.disconnect('disposed')
    this.listeners.clear()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private async connect(): Promise<void> {
    if (this.isDisposed || !this.appId.trim()) return

    // Lazy-require discord-rpc so a missing native dependency never crashes the app.
    let ClientCtor: typeof Client
    try {
      const mod = require('discord-rpc')
      ClientCtor = mod.Client
    } catch (err) {
      console.error('[DiscordRpcClient] Failed to load discord-rpc module:', err)
      this.setErrorState('Discord RPC module unavailable')
      return
    }

    if (this.client) {
      this.disconnect('reconnecting')
    }

    console.log('[DiscordRpcClient] Creating IPC client...')
    const client = new ClientCtor({ transport: 'ipc' })
    this.client = client

    const onReady = (): void => {
      if (this.isDisposed || this.client !== client) return
      console.log('[DiscordRpcClient] Connected to Discord')
      this.state.connected = true
      this.state.lastError = undefined
      this.emitState()

      if (this.currentActivity) {
        client.setActivity(this.normalizeActivity(this.currentActivity)).catch((err: unknown) => {
          console.warn('[DiscordRpcClient] setActivity failed:', err)
        })
      } else {
        // Default idle presence
        client
          .setActivity({
            startTimestamp: Date.now(),
            largeImageKey: 'zura_logo',
            largeImageText: 'ZuraAI',
          })
          .catch((err: unknown) => {
            console.warn('[DiscordRpcClient] Default setActivity failed:', err)
          })
      }
    }

    const onDisconnected = (): void => {
      if (this.client !== client) return
      console.log('[DiscordRpcClient] Disconnected from Discord')
      this.disconnect('Discord client disconnected')
      this.emitState()
      this.scheduleReconnect()
    }

    const onError = (err: Error): void => {
      if (this.client !== client) return
      console.error('[DiscordRpcClient] Discord RPC error:', err.message)
      this.disconnect(err.message || 'Discord RPC error')
      this.state.lastError = err.message || 'Discord RPC error'
      this.emitState()
      this.scheduleReconnect()
    }

    client.on('ready', onReady)
    client.on('disconnected', onDisconnected)
    client.on('error', onError)

    // Race the login against a timeout so a hung connection does not stall the app.
    const loginPromise = client.login({ clientId: this.appId.trim() })
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)
    })

    try {
      await Promise.race([loginPromise, timeoutPromise])
    } catch (error) {
      // Clean up the half-connected client
      client.destroy().catch(() => {
        /* ignore */
      })
      if (this.client === client) {
        this.client = null
      }
      const message = error instanceof Error ? error.message : String(error)
      console.error('[DiscordRpcClient] Connection failed:', message)
      this.setErrorState(message)
      this.scheduleReconnect()
    }
  }

  private disconnect(_reason: string): void {
    if (this.client) {
      const c = this.client
      this.client = null
      try {
        c.destroy()
      } catch {
        /* ignore */
      }
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.state.connected) {
      this.state.connected = false
    }
  }

  private scheduleReconnect(): void {
    if (this.isDisposed || this.reconnectTimer) return
    console.log('[DiscordRpcClient] Scheduling reconnect in', RECONNECT_INTERVAL_MS, 'ms')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, RECONNECT_INTERVAL_MS)
  }

  private setErrorState(error: string): void {
    this.state.connected = false
    this.state.lastError = error
    this.emitState()
  }

  private emitState(): void {
    const snapshot = this.getState()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        /* ignore listener errors */
      }
    }
  }

  private normalizeActivity(activity: DiscordRpcActivity): Record<string, unknown> {
    const normalized: Record<string, unknown> = {}
    if (activity.state !== undefined) normalized.state = activity.state
    if (activity.details !== undefined) normalized.details = activity.details
    if (activity.startTimestamp !== undefined) normalized.startTimestamp = activity.startTimestamp
    if (activity.endTimestamp !== undefined) normalized.endTimestamp = activity.endTimestamp
    if (activity.largeImageKey !== undefined) normalized.largeImageKey = activity.largeImageKey
    if (activity.largeImageText !== undefined) normalized.largeImageText = activity.largeImageText
    if (activity.smallImageKey !== undefined) normalized.smallImageKey = activity.smallImageKey
    if (activity.smallImageText !== undefined) normalized.smallImageText = activity.smallImageText
    if (activity.partyId !== undefined) {
      normalized.partyId = activity.partyId
      normalized.partySize = activity.partySize ?? 0
      normalized.partyMax = activity.partyMax ?? 0
    }
    if (activity.buttons !== undefined) normalized.buttons = activity.buttons
    return normalized
  }
}
