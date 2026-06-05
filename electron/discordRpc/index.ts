/**
 * Discord Rich Presence IPC registration.
 *
 * Exposes a narrow renderer bridge (`window.discordRpc`) for controlling
 * presence state and receiving connection updates.
 */

import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  getDiscordRpcClient,
  disposeDiscordRpcClient,
} from './rpcClient'
import type {
  DiscordRpcActivity,
  DiscordRpcState,
} from './types'

let stateBroadcastHandler: ((state: DiscordRpcState) => void) | null = null

export function registerDiscordRpcHandlers(getWindow: () => BrowserWindow | null): void {
  const client = getDiscordRpcClient()

  stateBroadcastHandler = (state: DiscordRpcState) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('discord-rpc:state-changed', state)
    }
  }

  client.onStateChange(stateBroadcastHandler)

  ipcMain.handle('discord-rpc:get-state', () => {
    return client.getState()
  })

  ipcMain.handle(
    'discord-rpc:set-activity',
    (_event, activity: DiscordRpcActivity) => {
      client.setActivity(activity)
      return client.getState()
    }
  )
}

export function unregisterDiscordRpcHandlers(): void {
  const client = getDiscordRpcClient()
  if (stateBroadcastHandler) {
    client.offStateChange(stateBroadcastHandler)
    stateBroadcastHandler = null
  }
  ipcMain.removeHandler('discord-rpc:get-state')
  ipcMain.removeHandler('discord-rpc:set-activity')
}

export { getDiscordRpcClient, disposeDiscordRpcClient }
