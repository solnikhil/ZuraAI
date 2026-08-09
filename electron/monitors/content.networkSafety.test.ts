// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchMonitorPage, validateResolvedAddresses } from './content'

const VALID_HTML =
  '<main><p>This public page has meaningful monitorable content for testing.</p></main>'

function makeStreamResponse(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  })
}

function makeRedirectResponse(location: string, status = 301) {
  return new Response(null, {
    status,
    headers: { location },
  })
}

describe('validateResolvedAddresses', () => {
  it('accepts public IPv4 addresses', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    await expect(validateResolvedAddresses('example.com', resolver)).resolves.toBeUndefined()
  })

  it('rejects private IPv4 address (192.168.x.x)', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['192.168.1.1']),
      resolve6: vi.fn(async () => []),
    }
    await expect(validateResolvedAddresses('evil.example.com', resolver)).rejects.toThrow(
      /private\/loopback/
    )
  })

  it('rejects loopback IPv4 address (127.0.0.1)', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['127.0.0.1']),
      resolve6: vi.fn(async () => []),
    }
    await expect(validateResolvedAddresses('sneaky.example.com', resolver)).rejects.toThrow(
      /private\/loopback/
    )
  })

  it('rejects private IPv4 range 10.x.x.x', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['10.0.0.1']),
      resolve6: vi.fn(async () => []),
    }
    await expect(validateResolvedAddresses('internal.example.com', resolver)).rejects.toThrow(
      /private\/loopback/
    )
  })

  it('rejects link-local IPv6 address', async () => {
    const resolver = {
      resolve4: vi.fn(async () => []),
      resolve6: vi.fn(async () => ['fe80::1']),
    }
    await expect(validateResolvedAddresses('sneaky6.example.com', resolver)).rejects.toThrow(
      /private\/loopback/
    )
  })

  it('handles DNS resolution failures gracefully (no records)', async () => {
    const resolver = {
      resolve4: vi.fn(async () => {
        throw new Error('ENOTFOUND')
      }),
      resolve6: vi.fn(async () => {
        throw new Error('ENOTFOUND')
      }),
    }
    await expect(
      validateResolvedAddresses('norecords.example.com', resolver)
    ).resolves.toBeUndefined()
  })
})

describe('fetchMonitorPage - redirect safety', () => {
  it('rejects redirect to private IP (192.168.1.1)', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/') {
        return makeRedirectResponse('http://192.168.1.1/evil')
      }
      return makeStreamResponse(VALID_HTML)
    }) as unknown as typeof fetch

    await expect(fetchMonitorPage('https://example.com/', fetchImpl, { resolver })).rejects.toThrow(
      /private/
    )
  })

  it('rejects redirect to loopback (127.0.0.1)', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/') {
        return makeRedirectResponse('http://127.0.0.1:8080/secret')
      }
      return makeStreamResponse(VALID_HTML)
    }) as unknown as typeof fetch

    await expect(fetchMonitorPage('https://example.com/', fetchImpl, { resolver })).rejects.toThrow(
      /private/
    )
  })

  it('rejects redirect to .local hostname', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/') {
        return makeRedirectResponse('http://printer.local/')
      }
      return makeStreamResponse(VALID_HTML)
    }) as unknown as typeof fetch

    await expect(fetchMonitorPage('https://example.com/', fetchImpl, { resolver })).rejects.toThrow(
      /local/
    )
  })

  it('throws when max redirect hops exceeded', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    let hop = 0
    const fetchImpl = vi.fn(async () => {
      hop++
      return makeRedirectResponse(`https://example.com/hop${hop}`)
    }) as unknown as typeof fetch

    await expect(fetchMonitorPage('https://example.com/', fetchImpl, { resolver })).rejects.toThrow(
      /Too many redirects/
    )
  })

  it('follows valid redirects to public URLs', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.com/') {
        return makeRedirectResponse('https://example.com/final')
      }
      return makeStreamResponse(VALID_HTML)
    }) as unknown as typeof fetch

    const result = await fetchMonitorPage('https://example.com/', fetchImpl, { resolver })
    expect(result.normalizedText).toContain('meaningful monitorable content')
    expect(result.contentHash).toHaveLength(64)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('fetchMonitorPage - DNS rejection on initial URL', () => {
  it('rejects hostname that DNS resolves to private IP', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['192.168.1.100']),
      resolve6: vi.fn(async () => []),
    }
    const fetchImpl = vi.fn(async () => makeStreamResponse(VALID_HTML)) as unknown as typeof fetch

    await expect(
      fetchMonitorPage('https://evil-public-domain.example.com/', fetchImpl, { resolver })
    ).rejects.toThrow(/private\/loopback/)
    // fetch should never have been called since DNS check fails first
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('fetchMonitorPage - timeout', () => {
  it('fires timeout for non-terminating response body', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }

    // Create a ReadableStream that never closes
    const neverEndingStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode('<html><body>'))
        // Never close - simulates a stuck server
      },
    })

    const fetchImpl = vi.fn(async () => {
      return new Response(neverEndingStream, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    // Use a short external abort to simulate the timeout mechanism
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)

    await expect(
      fetchMonitorPage('https://example.com/', fetchImpl, { resolver, signal: controller.signal })
    ).rejects.toThrow()
  }, 10_000)
})

describe('fetchMonitorPage - oversized body', () => {
  it('aborts oversized chunked body mid-stream', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }

    const chunkSize = 512 * 1024 // 512 KB
    const chunk = new Uint8Array(chunkSize).fill(65) // fill with 'A'

    // Create a stream that sends chunks exceeding 2MB
    const bigStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        // Send 5 chunks of 512 KB = 2.5 MB > MAX_RESPONSE_BYTES (2 MB)
        for (let i = 0; i < 5; i++) {
          ctrl.enqueue(chunk)
        }
        ctrl.close()
      },
    })

    const fetchImpl = vi.fn(async () => {
      return new Response(bigStream, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }) as unknown as typeof fetch

    await expect(fetchMonitorPage('https://example.com/', fetchImpl, { resolver })).rejects.toThrow(
      /too large/
    )
  })
})

describe('fetchMonitorPage - external cancellation', () => {
  it('respects an already-aborted external signal', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    const fetchImpl = vi.fn(async () => makeStreamResponse(VALID_HTML)) as unknown as typeof fetch

    const controller = new AbortController()
    controller.abort()

    await expect(
      fetchMonitorPage('https://example.com/', fetchImpl, { signal: controller.signal, resolver })
    ).rejects.toThrow(/aborted/)
  })
})

describe('fetchMonitorPage - normal happy path', () => {
  it('returns normalized content for a valid public page (no redirect)', async () => {
    const resolver = {
      resolve4: vi.fn(async () => ['93.184.216.34']),
      resolve6: vi.fn(async () => []),
    }
    const fetchImpl = vi.fn(async () => makeStreamResponse(VALID_HTML)) as unknown as typeof fetch

    const result = await fetchMonitorPage('https://example.com/', fetchImpl, { resolver })
    expect(result.normalizedText).toContain('meaningful monitorable content')
    expect(result.contentHash).toHaveLength(64)
    expect(result.excerpt.length).toBeGreaterThan(0)
  })
})
