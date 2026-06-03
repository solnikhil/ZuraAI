// @vitest-environment node

/**
 * Unit tests for `AgentDesktopService` initialization and state reporting
 * (Task 10.2).
 *
 * These are example-based tests (not property tests). They exercise only the
 * Task 10.1 scaffolding surface — `initialize()`, `getState()`, `dispose()`,
 * and `onStateChange()` — with the VDA binding fully injected through
 * {@link AgentDesktopServiceOptions.binding}. They deliberately do NOT depend on
 * `startSession` / `completeSession` / `gateComputerAction` (added by concurrent
 * tasks) so the suite stays stable.
 *
 * The central assertion (Req 8.4) is graceful degradation: when the VDA binding
 * is unavailable — whether because the platform is unsupported or because the
 * DLL/FFI failed to load — only the Agent Desktop capability is disabled. The
 * service never throws, always returns a valid state, and surfaces a
 * user-visible error that names VirtualDesktopAccessor.
 *
 * _Requirements: 8.4_
 */

import { describe, it, expect, vi } from 'vitest'

import { createAgentDesktopService } from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { AgentDesktopSession, VdaLoadOutcome } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * The OS-driving native methods on the binding. None of these should ever be
 * invoked during `initialize()`; provisioning/placement happen in later tasks.
 */
const OS_DRIVING_METHODS = [
  'getCurrentDesktopIndex',
  'getDesktopCount',
  'createDesktop',
  'removeDesktop',
  'goToDesktop',
  'desktopExists',
  'moveWindowToDesktop',
  'isWindowOnDesktop',
  'enumerateWindows',
] as const

/**
 * A fully-mocked {@link VdaBinding} whose methods are `vi.fn()` spies. `load()`
 * resolves to the supplied outcome; `getLoadError()` (read defensively by the
 * service) returns the supplied message. All OS-driving methods are no-ops so we
 * can assert they were never called.
 */
function makeMockBinding(options: {
  loadOutcome: VdaLoadOutcome
  loadError?: string | null
}): VdaBinding & { getLoadError: () => string | null } {
  const { loadOutcome, loadError = null } = options
  let available = false

  return {
    load: vi.fn(async (): Promise<VdaLoadOutcome> => {
      available = loadOutcome === 'available'
      return loadOutcome
    }),
    isAvailable: vi.fn(() => available),
    getLoadError: vi.fn(() => loadError),
    getCurrentDesktopIndex: vi.fn(() => 0),
    getDesktopCount: vi.fn(() => 1),
    createDesktop: vi.fn(() => 1),
    removeDesktop: vi.fn(),
    goToDesktop: vi.fn(),
    desktopExists: vi.fn(() => true),
    moveWindowToDesktop: vi.fn(),
    isWindowOnDesktop: vi.fn(() => true),
    enumerateWindows: vi.fn((): VdaWindowInfo[] => []),
    dispose: vi.fn(),
  }
}

/** Settings with the skill enabled (and disclosure acknowledged). */
function enabledSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
  }
}

class ReadyCheckBinding implements VdaBinding {
  private available = false
  existing = new Set<number>([0])
  current = 0
  nextIndex = 100
  createDesktopCalls = 0
  desktopExistsCalls: number[] = []
  nativeCalls = 0

  async load(): Promise<VdaLoadOutcome> {
    this.available = true
    return 'available'
  }

  isAvailable(): boolean {
    return this.available
  }

  getLoadError(): string | null {
    return null
  }

  getCurrentDesktopIndex(): number {
    this.nativeCalls += 1
    return this.current
  }

  getDesktopCount(): number {
    this.nativeCalls += 1
    return this.existing.size
  }

  createDesktop(): number {
    this.nativeCalls += 1
    this.createDesktopCalls += 1
    const index = this.nextIndex++
    this.existing.add(index)
    return index
  }

  removeDesktop(index: number): void {
    this.nativeCalls += 1
    this.existing.delete(index)
  }

  goToDesktop(index: number): void {
    this.nativeCalls += 1
    this.current = index
  }

  desktopExists(index: number): boolean {
    this.nativeCalls += 1
    this.desktopExistsCalls.push(index)
    return this.existing.has(index)
  }

  moveWindowToDesktop(): void {
    this.nativeCalls += 1
  }

  isWindowOnDesktop(): boolean {
    this.nativeCalls += 1
    return true
  }

  enumerateWindows(): VdaWindowInfo[] {
    this.nativeCalls += 1
    return []
  }

  dispose(): void {
    this.available = false
  }
}

function readSession(
  service: ReturnType<typeof createAgentDesktopService>
): AgentDesktopSession | null {
  return (service as unknown as { session: AgentDesktopSession | null }).session
}

describe('AgentDesktopService initialization and state reporting', () => {
  describe('VDA available', () => {
    it('reports vdaOutcome "available", capability "available" with an enabled skill, and null lastError', async () => {
      const binding = makeMockBinding({ loadOutcome: 'available' })
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: true,
      })

      const state = await service.initialize()

      expect(binding.load).toHaveBeenCalledTimes(1)
      expect(state.vdaOutcome).toBe('available')
      expect(state.capability).toBe('available')
      expect(state.enabled).toBe(true)
      expect(state.lastError).toBeNull()
      // getState() agrees with the value returned by initialize().
      expect(service.getState()).toEqual(state)
    })

    it('reports capability "unavailable" when the skill is disabled even though the VDA loaded', async () => {
      const binding = makeMockBinding({ loadOutcome: 'available' })
      const service = createAgentDesktopService({
        binding,
        // default settings have enabled: false
        platformSupported: true,
      })

      const state = await service.initialize()

      expect(state.vdaOutcome).toBe('available')
      expect(state.capability).toBe('unavailable')
      expect(state.enabled).toBe(false)
      expect(state.lastError).toBeNull()
    })
  })

  describe('VDA unavailable (load failure) — only Agent Desktop is disabled (Req 8.4)', () => {
    it('reports vdaOutcome/capability "unavailable" and a lastError naming VirtualDesktopAccessor, without throwing', async () => {
      const message =
        'The VirtualDesktopAccessor virtual-desktop integration could not be loaded.'
      const binding = makeMockBinding({ loadOutcome: 'unavailable', loadError: message })
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: true,
      })

      // initialize() must resolve (never throw) and return a valid state.
      const state = await service.initialize()

      expect(binding.load).toHaveBeenCalledTimes(1)
      expect(state.vdaOutcome).toBe('unavailable')
      expect(state.capability).toBe('unavailable')
      expect(state.lastError).toContain('VirtualDesktopAccessor')

      // The rest of the state is still well-formed: only Agent Desktop is off.
      expect(state.platformSupported).toBe(true)
      expect(state.enabled).toBe(true)
      expect(state.presence).toBeNull()
      expect(typeof state.maxActions).toBe('number')

      // initialize() must not drive any OS / native desktop operations.
      for (const method of OS_DRIVING_METHODS) {
        expect(binding[method], `${method} should not be called`).not.toHaveBeenCalled()
      }
    })

    it('falls back to a VirtualDesktopAccessor-naming message when the binding exposes no load error', async () => {
      const binding = makeMockBinding({ loadOutcome: 'unavailable', loadError: null })
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: true,
      })

      const state = await service.initialize()

      expect(state.vdaOutcome).toBe('unavailable')
      expect(state.capability).toBe('unavailable')
      expect(state.lastError).not.toBeNull()
      expect(state.lastError).toContain('VirtualDesktopAccessor')
    })
  })

  describe('Unsupported platform (macOS)', () => {
    it('reports capability "unavailable" and does NOT call binding.load()', async () => {
      const binding = makeMockBinding({ loadOutcome: 'available' })
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: false,
      })

      const state = await service.initialize()

      // The native binding is never touched on an unsupported platform.
      expect(binding.load).not.toHaveBeenCalled()
      for (const method of OS_DRIVING_METHODS) {
        expect(binding[method], `${method} should not be called`).not.toHaveBeenCalled()
      }

      expect(state.platformSupported).toBe(false)
      expect(state.vdaOutcome).toBe('unavailable')
      expect(state.capability).toBe('unavailable')
      expect(state.lastError).toBeNull()
    })
  })

  describe('onStateChange', () => {
    it('fires on initialize() and stops after unsubscribe', async () => {
      const binding = makeMockBinding({ loadOutcome: 'available' })
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: true,
      })

      const listener = vi.fn()
      const unsubscribe = service.onStateChange(listener)

      await service.initialize()
      expect(listener).toHaveBeenCalledTimes(1)
      // The listener receives a snapshot reflecting the loaded state.
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ vdaOutcome: 'available', capability: 'available' })
      )

      // After unsubscribe, a second initialize() does not notify again.
      unsubscribe()
      await service.initialize()
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('unsubscribe is idempotent (calling it twice is a no-op)', async () => {
      const binding = makeMockBinding({ loadOutcome: 'available' })
      const service = createAgentDesktopService({ binding, platformSupported: true })

      const listener = vi.fn()
      const unsubscribe = service.onStateChange(listener)
      unsubscribe()
      unsubscribe()

      await service.initialize()
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('calls binding.dispose() and is idempotent', () => {
      const binding = makeMockBinding({ loadOutcome: 'available' })
      const service = createAgentDesktopService({ binding, platformSupported: true })

      service.dispose()
      service.dispose()

      expect(binding.dispose).toHaveBeenCalledTimes(1)
      // After disposal the capability resolves to unavailable.
      expect(service.getState().capability).toBe('unavailable')
    })

    it('initialize() after dispose() is a no-op that does not load the binding', async () => {
      const binding = makeMockBinding({ loadOutcome: 'available' })
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: true,
      })

      service.dispose()
      const state = await service.initialize()

      expect(binding.load).not.toHaveBeenCalled()
      expect(state.capability).toBe('unavailable')
    })
  })

  describe('ensureReadyForTool', () => {
    it('keeps an active session when the recorded Agent Desktop still exists', async () => {
      const binding = new ReadyCheckBinding()
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: true,
      })
      await service.initialize()

      const start = await service.startSession('run-1')
      expect(start.provisioned).toBe(true)
      const session = readSession(service)
      expect(session).not.toBeNull()
      const agentDesktopIndex = session?.agentDesktopIndex
      expect(binding.createDesktopCalls).toBe(1)

      const ready = await service.ensureReadyForTool('run-2')

      expect(ready.ready).toBe(true)
      expect(binding.createDesktopCalls).toBe(1)
      expect(binding.desktopExistsCalls).toContain(agentDesktopIndex)
      expect(readSession(service)?.agentRunId).toBe('run-1')
    })

    it('recreates a stale active session before tool work and resets per-session state', async () => {
      const binding = new ReadyCheckBinding()
      const service = createAgentDesktopService({
        binding,
        settings: enabledSettings(),
        platformSupported: true,
      })
      await service.initialize()
      const start = await service.startSession('run-1')
      expect(start.provisioned).toBe(true)

      const staleSession = readSession(service)
      expect(staleSession).not.toBeNull()
      const staleIndex = staleSession?.agentDesktopIndex
      expect(typeof staleIndex).toBe('number')

      const gate = await service.gateComputerAction({ action: 'screenshot', args: {} })
      expect(gate.allow).toBe(true)
      expect(service.getState().actionCount).toBe(1)

      const takeover = await service.activateTakeOver()
      expect(takeover.ok).toBe(true)
      ;(service as unknown as { pendingApprovalCount: number }).pendingApprovalCount = 2
      binding.existing.delete(staleIndex as number)
      binding.current = 0

      const ready = await service.ensureReadyForTool('run-2')

      expect(ready.ready).toBe(true)
      const replacement = readSession(service)
      expect(replacement).not.toBeNull()
      expect(replacement?.agentRunId).toBe('run-2')
      expect(replacement?.agentDesktopIndex).not.toBe(staleIndex)
      expect(binding.createDesktopCalls).toBe(2)
      expect(service.getState()).toEqual(
        expect.objectContaining({
          capability: 'active',
          actionCount: 0,
          pendingApprovalCount: 0,
          agentDesktopDisplayed: false,
          presence: 'background',
        })
      )
    })

    it('fails closed without provisioning when VDA is unavailable, the skill is disabled, or disclosure is missing', async () => {
      const unavailable = makeMockBinding({
        loadOutcome: 'unavailable',
        loadError: 'The VirtualDesktopAccessor virtual-desktop integration could not be loaded.',
      })
      const unavailableService = createAgentDesktopService({
        binding: unavailable,
        settings: enabledSettings(),
        platformSupported: true,
      })

      const unavailableReady = await unavailableService.ensureReadyForTool('run-vda')
      expect(unavailableReady.ready).toBe(false)
      expect(unavailableReady.error).toContain('VirtualDesktopAccessor')
      expect(unavailable.createDesktop).not.toHaveBeenCalled()

      const disabledBinding = new ReadyCheckBinding()
      const disabledService = createAgentDesktopService({
        binding: disabledBinding,
        settings: {
          ...enabledSettings(),
          enabled: false,
        },
        platformSupported: true,
      })
      await disabledService.initialize()

      const disabledReady = await disabledService.ensureReadyForTool('run-disabled')
      expect(disabledReady.ready).toBe(false)
      expect(disabledReady.error).toContain('disabled')
      expect(disabledBinding.createDesktopCalls).toBe(0)

      const disclosureBinding = new ReadyCheckBinding()
      const disclosureService = createAgentDesktopService({
        binding: disclosureBinding,
        settings: {
          ...enabledSettings(),
          disclosureAcknowledged: false,
        },
        platformSupported: true,
      })
      await disclosureService.initialize()

      const disclosureReady = await disclosureService.ensureReadyForTool('run-disclosure')
      expect(disclosureReady.ready).toBe(false)
      expect(disclosureReady.error).toContain('disclosure')
      expect(disclosureBinding.createDesktopCalls).toBe(0)
    })
  })
})
