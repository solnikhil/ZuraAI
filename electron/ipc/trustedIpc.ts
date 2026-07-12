import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface TrustedIpcSenderOptions {
  devServerUrl?: string
  rendererEntryPath?: string
  resolveWindow?: (sender: WebContents) => BrowserWindow | null
}

function exactOrigin(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function defaultRendererEntryPath(): string {
  return path.resolve(__dirname, '../dist/index.html')
}

function isTrustedRendererUrl(
  rawUrl: string,
  { devServerUrl, rendererEntryPath = defaultRendererEntryPath() }: TrustedIpcSenderOptions
): boolean {
  try {
    const url = new URL(rawUrl)
    const devOrigin = exactOrigin(devServerUrl)

    if (devOrigin && url.origin === devOrigin) {
      return true
    }

    if (url.protocol !== 'file:') return false
    return path.resolve(fileURLToPath(url)) === path.resolve(rendererEntryPath)
  } catch {
    return false
  }
}

export function isTrustedIpcSender(
  event: IpcMainInvokeEvent,
  options: TrustedIpcSenderOptions = {}
): boolean {
  const sender = event?.sender
  if (!sender || typeof sender.isDestroyed !== 'function' || sender.isDestroyed()) return false

  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame !== sender.mainFrame) return false

  const resolveWindow =
    options.resolveWindow ?? ((contents: WebContents) => BrowserWindow.fromWebContents(contents))
  const window = resolveWindow(sender)
  if (!window || window.isDestroyed()) return false

  return isTrustedRendererUrl(senderFrame.url, {
    ...options,
    devServerUrl: options.devServerUrl ?? process.env.VITE_DEV_SERVER_URL,
  })
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent,
  options?: TrustedIpcSenderOptions
): void {
  if (!isTrustedIpcSender(event, options)) {
    throw new Error('Blocked IPC request from an untrusted renderer.')
  }
}

type TrustedInvokeHandler<Args extends unknown[], Result> = (
  event: IpcMainInvokeEvent,
  ...args: Args
) => Result

export const trustedIpcMain = {
  handle<Args extends unknown[], Result>(
    channel: string,
    listener: TrustedInvokeHandler<Args, Result>
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedIpcSender(event)
      return listener(event, ...(args as Args))
    })
  },
  removeHandler(channel: string): void {
    ipcMain.removeHandler(channel)
  },
}
