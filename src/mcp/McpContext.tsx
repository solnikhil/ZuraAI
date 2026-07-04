import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type {
  McpApprovalRequest,
  McpAuthStatus,
  McpNamespacedTool,
  McpPromptResult,
  McpRuntimePrompt,
  McpRuntimeResource,
  McpRuntimeSnapshot,
  McpResourceReadResult,
  McpServerConfig,
  McpServerRuntimeState,
} from './types'
import {
  createEmptyMcpDraftServer,
  draftServerToInputPayload,
  isDraftServerEqualToLiveServer,
  mcpServerToDraftServer,
  validateDraftServer,
  type McpDraftServer,
} from './draft'
import type { McpAgentAddApproveResult, McpAgentAddReview } from './addRequestTypes'

interface McpContextValue {
  isSupported: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  servers: McpServerConfig[]
  runtimeStates: McpServerRuntimeState[]
  tools: McpNamespacedTool[]
  resources: McpRuntimeResource[]
  prompts: McpRuntimePrompt[]
  pendingApprovals: McpApprovalRequest[]
  authStatuses: McpAuthStatus[]
  draftServers: McpDraftServer[]
  hasDraftChanges: boolean
  createDraftServer: () => McpDraftServer
  addServer: (server: McpDraftServer) => Promise<void>
  upsertDraftServer: (server: McpDraftServer) => void
  removeDraftServer: (serverId: string) => void
  discardDraft: () => void
  saveDraft: () => Promise<void>
  refresh: () => Promise<McpRuntimeSnapshot | null>
  openConfigFile: () => Promise<{ ok: boolean; path?: string; error?: string }>
  connectServer: (serverId: string) => Promise<void>
  disconnectServer: (serverId: string) => Promise<void>
  listResources: (serverId?: string) => Promise<McpRuntimeResource[]>
  readResource: (serverId: string, uri: string) => Promise<McpResourceReadResult>
  listPrompts: (serverId?: string) => Promise<McpRuntimePrompt[]>
  getPrompt: (
    serverId: string,
    promptName: string,
    args: Record<string, unknown>
  ) => Promise<McpPromptResult>
  resolveApproval: (requestId: string, approved: boolean) => Promise<void>
  startOAuth: (serverId: string) => Promise<void>
  clearOAuth: (serverId: string) => Promise<void>
  requestAddServerFromAgent: (requestId: string) => Promise<McpAgentAddReview>
  approvePendingAddRequest: (requestId: string) => Promise<McpAgentAddApproveResult>
  cancelPendingAddRequest: (requestId: string) => Promise<McpAgentAddReview>
  getRuntimeState: (serverId: string) => McpServerRuntimeState | undefined
  getAuthStatus: (serverId: string) => McpAuthStatus | undefined
}

const emptySnapshot: McpRuntimeSnapshot = {
  servers: [],
  runtimeStates: [],
  tools: [],
  resources: [],
  prompts: [],
  pendingApprovals: [],
  authStatuses: [],
}

const McpContext = createContext<McpContextValue | undefined>(undefined)

export function McpProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [snapshot, setSnapshot] = useState<McpRuntimeSnapshot>(emptySnapshot)
  const [draftServers, setDraftServers] = useState<McpDraftServer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isSupported = typeof window !== 'undefined' && Boolean(window.mcp)

  const syncDraftFromSnapshot = useCallback((nextSnapshot: McpRuntimeSnapshot) => {
    setDraftServers(nextSnapshot.servers.map((server) => mcpServerToDraftServer(server)))
  }, [])

  const hasDraftChanges = useMemo(() => {
    const liveServersById = new Map(snapshot.servers.map((server) => [server.id, server]))

    if (draftServers.length !== snapshot.servers.length) {
      return true
    }

    for (const draftServer of draftServers) {
      const liveServer = liveServersById.get(draftServer.id)
      if (!liveServer || !isDraftServerEqualToLiveServer(draftServer, liveServer)) {
        return true
      }
    }

    return false
  }, [draftServers, snapshot.servers])

  const hasDraftChangesRef = useRef(hasDraftChanges)
  useEffect(() => {
    hasDraftChangesRef.current = hasDraftChanges
  }, [hasDraftChanges])

  const applySnapshot = useCallback(
    (nextSnapshot: McpRuntimeSnapshot) => {
      setSnapshot(nextSnapshot)
      setError(null)
      if (!hasDraftChangesRef.current) {
        syncDraftFromSnapshot(nextSnapshot)
      }
    },
    [syncDraftFromSnapshot]
  )

  const refresh = useCallback(async () => {
    if (!window.mcp) {
      setIsLoading(false)
      setIsRefreshing(false)
      setSnapshot(emptySnapshot)
      setDraftServers([])
      setError('MCP bridge is unavailable in this environment.')
      return null
    }

    setIsRefreshing(true)
    try {
      const nextSnapshot = await window.mcp.getState()
      applySnapshot(nextSnapshot)
      return nextSnapshot
    } catch (refreshError) {
      setError(toErrorMessage(refreshError))
      return null
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [applySnapshot])

  useEffect(() => {
    if (!window.mcp) {
      setIsLoading(false)
      setError('MCP bridge is unavailable in this environment.')
      return
    }

    let isMounted = true
    const unsubscribe = window.mcp.onStateChange((nextSnapshot) => {
      if (isMounted) {
        applySnapshot(nextSnapshot)
      }
    })

    void refresh()

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [applySnapshot, refresh])

  const upsertDraftServer = useCallback((server: McpDraftServer) => {
    setDraftServers((currentDraftServers) => {
      const nextDraftServers = [...currentDraftServers]
      const existingIndex = nextDraftServers.findIndex((entry) => entry.id === server.id)
      if (existingIndex >= 0) {
        nextDraftServers[existingIndex] = server
        return nextDraftServers
      }

      nextDraftServers.push(server)
      return nextDraftServers
    })
  }, [])

  const removeDraftServer = useCallback((serverId: string) => {
    setDraftServers((currentDraftServers) =>
      currentDraftServers.filter((server) => server.id !== serverId)
    )
  }, [])

  const discardDraft = useCallback(() => {
    syncDraftFromSnapshot(snapshot)
    setError(null)
  }, [snapshot, syncDraftFromSnapshot])

  const saveDraft = useCallback(async () => {
    if (!window.mcp) {
      throw new Error('MCP bridge is unavailable in this environment.')
    }

    const validationErrors = draftServers.flatMap((draftServer) =>
      validateDraftServer(draftServer).map(
        (message) => `${draftServer.name.trim() || 'Untitled Server'}: ${message}`
      )
    )
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join('\n'))
    }

    const liveServersById = new Map(snapshot.servers.map((server) => [server.id, server]))
    const draftServerIds = new Set(draftServers.map((server) => server.id))

    for (const liveServer of snapshot.servers) {
      if (!draftServerIds.has(liveServer.id)) {
        await window.mcp.removeServer(liveServer.id)
      }
    }

    for (const draftServer of draftServers) {
      const liveServer = liveServersById.get(draftServer.id)
      const payload = draftServerToInputPayload(draftServer)

      if (!liveServer) {
        await window.mcp.addServer(payload)
        continue
      }

      if (!isDraftServerEqualToLiveServer(draftServer, liveServer)) {
        await window.mcp.updateServer(draftServer.id, payload)
      }
    }

    const nextSnapshot = await window.mcp.getState()
    setSnapshot(nextSnapshot)
    syncDraftFromSnapshot(nextSnapshot)
    setError(null)
    setIsLoading(false)
  }, [draftServers, snapshot.servers, syncDraftFromSnapshot])

  const addServer = useCallback(
    async (server: McpDraftServer) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }
      if (hasDraftChanges) {
        throw new Error('Save or discard MCP changes before adding a catalogue server.')
      }

      const validationErrors = validateDraftServer(server)
      if (validationErrors.length > 0) {
        const serverName = server.name.trim() || 'Untitled Server'
        throw new Error(validationErrors.map((message) => `${serverName}: ${message}`).join('\n'))
      }

      await window.mcp.addServer(draftServerToInputPayload(server))
      const nextSnapshot = await window.mcp.getState()
      setSnapshot(nextSnapshot)
      syncDraftFromSnapshot(nextSnapshot)
      setError(null)
      setIsLoading(false)
    },
    [hasDraftChanges, syncDraftFromSnapshot]
  )

  const connectServer = useCallback(
    async (serverId: string) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }

      await window.mcp.connectServer(serverId)
      await refresh()
    },
    [refresh]
  )

  const openConfigFile = useCallback(async () => {
    if (!window.mcp) {
      throw new Error('MCP bridge is unavailable in this environment.')
    }

    return window.mcp.openConfigFile()
  }, [])

  const disconnectServer = useCallback(
    async (serverId: string) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }

      await window.mcp.disconnectServer(serverId)
      await refresh()
    },
    [refresh]
  )

  const listResources = useCallback(async (serverId?: string) => {
    if (!window.mcp) {
      throw new Error('MCP bridge is unavailable in this environment.')
    }

    return window.mcp.listResources(serverId)
  }, [])

  const readResource = useCallback(async (serverId: string, uri: string) => {
    if (!window.mcp) {
      throw new Error('MCP bridge is unavailable in this environment.')
    }

    return window.mcp.readResource(serverId, uri)
  }, [])

  const listPrompts = useCallback(async (serverId?: string) => {
    if (!window.mcp) {
      throw new Error('MCP bridge is unavailable in this environment.')
    }

    return window.mcp.listPrompts(serverId)
  }, [])

  const getPrompt = useCallback(
    async (serverId: string, promptName: string, args: Record<string, unknown>) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }

      return window.mcp.getPrompt(serverId, promptName, args)
    },
    []
  )

  const resolveApproval = useCallback(
    async (requestId: string, approved: boolean) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }

      await window.mcp.resolveApproval(requestId, approved)
      await refresh()
    },
    [refresh]
  )

  const startOAuth = useCallback(
    async (serverId: string) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }

      const result = await window.mcp.startOAuth(serverId)
      if (!result.ok) {
        throw new Error(result.error || result.status.lastError || 'MCP sign-in failed.')
      }
      await refresh()
    },
    [refresh]
  )

  const clearOAuth = useCallback(
    async (serverId: string) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }

      await window.mcp.clearOAuth(serverId)
      await refresh()
    },
    [refresh]
  )

  const requestAddServerFromAgent = useCallback(async (requestId: string) => {
    if (!window.mcp) {
      throw new Error('MCP bridge is unavailable in this environment.')
    }

    return window.mcp.resolveAddRequest(requestId)
  }, [])

  const approvePendingAddRequest = useCallback(
    async (requestId: string) => {
      if (!window.mcp) {
        throw new Error('MCP bridge is unavailable in this environment.')
      }

      const result = await window.mcp.approveAddRequest(requestId)
      await refresh()
      return result
    },
    [refresh]
  )

  const cancelPendingAddRequest = useCallback(async (requestId: string) => {
    if (!window.mcp) {
      throw new Error('MCP bridge is unavailable in this environment.')
    }

    return window.mcp.cancelAddRequest(requestId)
  }, [])

  const getRuntimeState = useCallback(
    (serverId: string) => snapshot.runtimeStates.find((state) => state.serverId === serverId),
    [snapshot.runtimeStates]
  )

  const getAuthStatus = useCallback(
    (serverId: string) => snapshot.authStatuses?.find((status) => status.serverId === serverId),
    [snapshot.authStatuses]
  )

  const value = useMemo<McpContextValue>(
    () => ({
      isSupported,
      isLoading,
      isRefreshing,
      error,
      servers: snapshot.servers,
      runtimeStates: snapshot.runtimeStates,
      tools: snapshot.tools,
      resources: snapshot.resources,
      prompts: snapshot.prompts,
      pendingApprovals: snapshot.pendingApprovals,
      authStatuses: snapshot.authStatuses ?? [],
      draftServers,
      hasDraftChanges,
      createDraftServer: createEmptyMcpDraftServer,
      addServer,
      upsertDraftServer,
      removeDraftServer,
      discardDraft,
      saveDraft,
      refresh,
      openConfigFile,
      connectServer,
      disconnectServer,
      listResources,
      readResource,
      listPrompts,
      getPrompt,
      resolveApproval,
      startOAuth,
      clearOAuth,
      requestAddServerFromAgent,
      approvePendingAddRequest,
      cancelPendingAddRequest,
      getRuntimeState,
      getAuthStatus,
    }),
    [
      addServer,
      connectServer,
      disconnectServer,
      discardDraft,
      draftServers,
      error,
      getPrompt,
      getAuthStatus,
      getRuntimeState,
      hasDraftChanges,
      isLoading,
      isRefreshing,
      isSupported,
      listPrompts,
      listResources,
      openConfigFile,
      readResource,
      resolveApproval,
      refresh,
      removeDraftServer,
      saveDraft,
      snapshot.prompts,
      snapshot.resources,
      snapshot.runtimeStates,
      snapshot.servers,
      snapshot.tools,
      snapshot.pendingApprovals,
      snapshot.authStatuses,
      startOAuth,
      clearOAuth,
      requestAddServerFromAgent,
      approvePendingAddRequest,
      cancelPendingAddRequest,
      upsertDraftServer,
    ]
  )

  return <McpContext.Provider value={value}>{children}</McpContext.Provider>
}

export function useMcp(): McpContextValue {
  const context = useContext(McpContext)
  if (!context) {
    throw new Error('useMcp must be used within an McpProvider')
  }

  return context
}

export function useOptionalMcp(): McpContextValue | undefined {
  return useContext(McpContext)
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
