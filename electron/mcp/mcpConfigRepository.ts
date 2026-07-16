import type { McpServerConfig } from '../../src/mcp/types'
import { loadMcpServers, saveMcpServers } from './mcpStorage'

export interface McpConfigRepository {
  load: () => Promise<McpServerConfig[]>
  save: (servers: McpServerConfig[]) => Promise<void>
}

export function createMcpConfigRepository(
  overrides: Partial<McpConfigRepository> = {}
): McpConfigRepository {
  return {
    load: overrides.load ?? loadMcpServers,
    save: overrides.save ?? saveMcpServers,
  }
}
