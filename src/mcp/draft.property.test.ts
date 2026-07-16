import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  draftServerToInputPayload,
  draftServersToMcpJsonText,
  mcpServerToDraftServer,
  parseMcpJsonDraftServers,
} from './draft'
import type { McpServerConfig } from './types'

const identifier = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,15}$/)
  .filter((value) => value.toLowerCase() !== 'authorization')
const text = fc.string({ minLength: 1, maxLength: 30 }).filter((value) => value.trim().length > 0)

function comparablePayload(server: ReturnType<typeof draftServerToInputPayload>) {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = server
  return payload
}

describe('MCP draft codec properties', () => {
  it('round-trips valid stdio drafts without changing their input payload', () => {
    fc.assert(
      fc.property(
        identifier,
        text,
        fc.array(text, { maxLength: 5 }),
        fc.uniqueArray(fc.tuple(identifier, text), {
          maxLength: 5,
          selector: ([name]) => name.toLowerCase(),
        }),
        (name, command, args, envEntries) => {
          const first = parseMcpJsonDraftServers(
            JSON.stringify({
              mcpServers: {
                [name]: {
                  command,
                  args,
                  env: Object.fromEntries(envEntries),
                },
              },
            })
          )
          expect(first.errors).toEqual([])

          const second = parseMcpJsonDraftServers(draftServersToMcpJsonText(first.servers))
          expect(second.errors).toEqual([])
          expect(comparablePayload(draftServerToInputPayload(second.servers[0]!))).toEqual(
            comparablePayload(draftServerToInputPayload(first.servers[0]!))
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('never copies a stored secret value into renderer drafts, JSON exports, or input payloads', () => {
    fc.assert(
      fc.property(identifier, fc.stringMatching(/^[a-f0-9]{8,24}$/), (name, suffix) => {
        const secret = `RAW_SECRET_${suffix}_END`
        const server: McpServerConfig = {
          id: `server-${name}`,
          name,
          enabled: true,
          trustState: 'untrusted',
          transport: 'stdio',
          command: 'npx',
          args: [],
          env: [
            {
              name: 'TOKEN',
              valueSource: 'secret',
              secretKey: `mcp.${name}.token`,
              // Defend against accidentally populated/sanitization-bypassing objects.
              value: secret,
            },
          ],
          headers: [],
          auth: { mode: 'none', state: 'none' },
          autoConnect: false,
          requireApproval: true,
          toolAllowlist: [],
          toolBlocklist: [],
        }

        const draft = mcpServerToDraftServer(server)
        const exported = draftServersToMcpJsonText([draft])
        const payload = JSON.stringify(draftServerToInputPayload(draft))

        expect(draft.env[0]?.secretValue).toBe('')
        expect(draft.env[0]?.value).toBe('')
        expect(exported).not.toContain(secret)
        expect(payload).not.toContain(secret)
      }),
      { numRuns: 100 }
    )
  })
})
