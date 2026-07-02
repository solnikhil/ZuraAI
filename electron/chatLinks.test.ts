// @vitest-environment node

import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
    setAsDefaultProtocolClient: vi.fn(),
    on: vi.fn(),
  },
}))

vi.mock('./windows', () => ({
  getMainWindow: vi.fn(() => null),
  createMainWindow: vi.fn(),
}))

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

describe('zura chat links', () => {
  beforeEach(() => {
    vi.resetModules()
    electronMock.userDataPath = path.join('C:', 'Users', 'Nikhil', 'AppData', 'Roaming', 'zura')
  })

  it('parses validated zura-chat message links', async () => {
    const { parseZuraChatMessageUrl } = await import('./chatLinks')
    const userData = encodeBase64Url(electronMock.userDataPath)
    const message = encodeURIComponent('continue this chat')

    const request = parseZuraChatMessageUrl(
      `zura-chat://session-1?userData=${userData}&message=${message}`
    )

    expect(request).toMatchObject({
      sessionId: 'session-1',
      message: 'continue this chat',
    })
    expect(typeof request?.receivedAt).toBe('number')
  })

  it('supports base64url encoded messages', async () => {
    const { parseZuraChatMessageUrl } = await import('./chatLinks')
    const userData = encodeBase64Url(electronMock.userDataPath)
    const encodedMessage = encodeBase64Url('line 1\nline 2')

    const request = parseZuraChatMessageUrl(
      `zura-chat://session-1?userData=${userData}&messageBase64=${encodedMessage}`
    )

    expect(request?.message).toBe('line 1\nline 2')
  })

  it('normalizes the implicit trailing slash Electron adds to host-only links', async () => {
    const { parseZuraChatMessageUrl } = await import('./chatLinks')
    const userData = encodeBase64Url(electronMock.userDataPath)

    const request = parseZuraChatMessageUrl(
      `zura-chat://session-1/?userData=${userData}&message=hello`
    )

    expect(request?.sessionId).toBe('session-1')
  })

  it('rejects links for a different userData directory', async () => {
    const { parseZuraChatMessageUrl } = await import('./chatLinks')
    const otherUserData = encodeBase64Url(path.join('C:', 'other', 'zura'))

    const request = parseZuraChatMessageUrl(
      `zura-chat://session-1?userData=${otherUserData}&message=hello`
    )

    expect(request).toBeNull()
  })

  it('accepts session-only links without a message', async () => {
    const { parseZuraChatMessageUrl } = await import('./chatLinks')
    const userData = encodeBase64Url(electronMock.userDataPath)

    const request = parseZuraChatMessageUrl(`zura-chat://session-1?userData=${userData}`)

    expect(request).toMatchObject({
      sessionId: 'session-1',
    })
    expect(request?.message).toBeUndefined()
  })

  it('accepts CLI-created chat links with constrained session ids', async () => {
    const { parseZuraChatMessageUrl } = await import('./chatLinks')
    const userData = encodeBase64Url(electronMock.userDataPath)

    const request = parseZuraChatMessageUrl(
      `zura-chat://cli-mabc123-xyz?userData=${userData}&createIfMissing=1&message=hello`
    )

    expect(request).toMatchObject({
      sessionId: 'cli-mabc123-xyz',
      message: 'hello',
      createIfMissing: true,
    })
  })

  it('rejects createIfMissing links without CLI-shaped session ids', async () => {
    const { parseZuraChatMessageUrl } = await import('./chatLinks')
    const userData = encodeBase64Url(electronMock.userDataPath)

    const request = parseZuraChatMessageUrl(
      `zura-chat://..%2Fsession?userData=${userData}&createIfMissing=1&message=hello`
    )

    expect(request).toBeNull()
  })
})
