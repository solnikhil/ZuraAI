/**
 * Agent Desktop (Agent View) — `VirtualDesktopAccessor.dll` FFI adapter.
 *
 * This module is the **single isolation point** over `VirtualDesktopAccessor.dll`.
 * No other module in the codebase may touch the DLL or the FFI library directly;
 * everything depends on the {@link VdaBinding} interface exported here. That keeps
 * the brittle native surface — which changes between Windows builds — behind one
 * well-tested boundary (Req 8.1–8.3).
 *
 * ## Graceful degradation (Req 8.1, 8.2)
 * The FFI module (`koffi`) and the DLL are loaded lazily via `require()` inside a
 * try/catch, mirroring the lazy nut.js load in
 * `electron/tools/computer-use/actions.ts`. Neither `koffi` nor the DLL is a hard
 * build dependency: if either is absent, or an expected export is missing or has
 * an incompatible arity, {@link VdaBinding.load} resolves to `'unavailable'` and
 * {@link VdaBinding.isAvailable} returns `false`. The process never crashes and no
 * unhandled exception escapes — the Agent Desktop capability is simply disabled
 * while every other application capability keeps working.
 *
 * ## Per-call safety (Req 8.3)
 * Every method wraps its native call in try/catch and throws a {@link VdaError}
 * with an appropriate `cause` (`'incompatible-api'` | `'call-failed'`) rather than
 * letting a raw native exception escape. The caller (`AgentDesktopService`) catches
 * `VdaError` and surfaces a user-visible message that names the VirtualDesktopAccessor
 * integration as the cause.
 *
 * ## Identity vs. index (Req 1.1, 1.2)
 * The DLL identifies desktops by both a stable GUID and a volatile ordinal index;
 * indices shift when desktops are added or removed. This adapter intentionally
 * exposes the **index-based** primitives that the DLL provides directly
 * (`getCurrentDesktopIndex`, `createDesktop`, `goToDesktop`, …). A **GUID resolution
 * layer is designed to sit above this binding** in `service.ts`: the service stores
 * a GUID-style identifier at provisioning time and resolves it to the current index
 * per call (via `desktopExists` / index lookup) so a recorded Agent_Desktop survives
 * desktop reordering. This module deliberately stays the thin, index-level isolation
 * point and can be extended with native GUID lookups when the target DLL exposes them.
 *
 * ## Testability
 * The native FFI module and DLL path are **injectable** through the constructor
 * ({@link VdaBindingOptions}) so tests can mock the entire native surface without
 * `koffi` or a real DLL being installed.
 */

import os from 'os'
import path from 'path'

import { VDA_LOAD_TIMEOUT_MS } from './constants'
// `VdaLoadOutcome` is the shared type owned by `types.ts`; import it rather than
// redefining it here to avoid a duplicate-definition conflict.
import type { VdaLoadOutcome } from './types'

export type { VdaLoadOutcome }

/**
 * Information about a single top-level native window, as enumerated through the
 * FFI layer. `desktopIndex` is `-1` when the window's desktop is unknown or the
 * window is pinned to all desktops.
 */
export interface VdaWindowInfo {
  /** Native window handle (HWND) as a numeric address. */
  hwnd: number
  /** Window title text. */
  title: string
  /** Owning process id. */
  pid: number
  /** Resolved Virtual_Desktop index, or `-1` if unknown / pinned. */
  desktopIndex: number
}

/**
 * The reason a {@link VdaError} was raised.
 * - `load-failed`: the FFI module or DLL could not be required/loaded.
 * - `incompatible-api`: a required export is missing or has an unexpected shape
 *   for the current Windows build.
 * - `call-failed`: a native call threw at runtime, or was attempted while the
 *   binding was unavailable.
 */
export type VdaErrorCause = 'load-failed' | 'incompatible-api' | 'call-failed'

/**
 * Error raised by the VDA binding. Carries a structured {@link VdaErrorCause} so
 * the service layer can map it to the correct user-visible degradation message
 * (Req 8.2, 8.3). A proper `Error` subclass with a restored prototype chain so
 * `instanceof VdaError` works across the transpilation target.
 */
export class VdaError extends Error {
  readonly cause: VdaErrorCause

  constructor(cause: VdaErrorCause, message?: string) {
    super(message ?? defaultMessageForCause(cause))
    this.name = 'VdaError'
    this.cause = cause
    // Restore the prototype chain (required when targeting ES5/older lib targets).
    Object.setPrototypeOf(this, VdaError.prototype)
  }
}

function defaultMessageForCause(cause: VdaErrorCause): string {
  switch (cause) {
    case 'load-failed':
      return 'The VirtualDesktopAccessor integration could not be loaded.'
    case 'incompatible-api':
      return 'The VirtualDesktopAccessor integration is incompatible with this Windows build.'
    case 'call-failed':
    default:
      return 'A VirtualDesktopAccessor call failed.'
  }
}

/**
 * The public binding contract. Every consumer depends on this interface, never on
 * the DLL or the FFI library directly.
 */
export interface VdaBinding {
  /**
   * Attempt to load and probe the DLL within `timeoutMs` (default
   * {@link VDA_LOAD_TIMEOUT_MS}). Records and returns the load outcome. Safe to
   * call more than once; a successful load is cached. (Req 8.1)
   */
  load(timeoutMs?: number): Promise<VdaLoadOutcome>
  /** Whether the binding loaded successfully and is usable. */
  isAvailable(): boolean
  /** Index of the currently displayed Virtual_Desktop. */
  getCurrentDesktopIndex(): number
  /** Total number of Virtual_Desktops. */
  getDesktopCount(): number
  /** Create a new Virtual_Desktop and return its index. */
  createDesktop(): number
  /** Remove the Virtual_Desktop at `index`. */
  removeDesktop(index: number): void
  /** Switch the displayed Virtual_Desktop to `index`. */
  goToDesktop(index: number): void
  /** Whether a Virtual_Desktop exists at `index`. */
  desktopExists(index: number): boolean
  /** Move the window `hwnd` onto the Virtual_Desktop at `index`. */
  moveWindowToDesktop(hwnd: number, index: number): void
  /** Whether the window `hwnd` currently resides on the Virtual_Desktop at `index`. */
  isWindowOnDesktop(hwnd: number, index: number): boolean
  /** Enumerate top-level windows with their resolved desktop index. */
  enumerateWindows(): VdaWindowInfo[]
  /** Release the binding and any native resources (Req 1.7, app quit). */
  dispose(): void
}

/**
 * The normalized native surface returned by a {@link VdaNativeLoader}.
 *
 * Keys mirror the `VirtualDesktopAccessor.dll` C exports, but each function is a
 * thin JS wrapper whose **arity matches how this adapter calls it** (the real
 * loader adapts the underlying C ABI; e.g. `RemoveDesktop`'s fallback-desktop
 * argument is supplied inside the wrapper). This lets the load-time probe verify
 * both presence and arity uniformly for the real loader and for test mocks.
 */
export interface VdaNativeModule {
  GetCurrentDesktopNumber: () => number
  GetDesktopCount: () => number
  CreateDesktop: () => number
  RemoveDesktop: (index: number) => void
  GoToDesktop: (index: number) => void
  MoveWindowToDesktopNumber: (hwnd: number, index: number) => void
  IsWindowOnDesktopNumber: (hwnd: number, index: number) => number
  /** user32-backed enumeration helper that resolves each window's desktop index. */
  enumerateWindows: () => VdaWindowInfo[]
  /** Optional native cleanup invoked on {@link VdaBinding.dispose}. */
  dispose?: () => void
}

/**
 * A function that loads the native surface from a DLL path. Injected for testing;
 * defaults to the `koffi`-backed loader.
 */
export type VdaNativeLoader = (dllPath: string) => VdaNativeModule

/** Construction options. All fields are optional and exist primarily for testing. */
export interface VdaBindingOptions {
  /** Injectable native loader. Defaults to {@link defaultKoffiLoader}. */
  loader?: VdaNativeLoader
  /** Injectable DLL path resolver. Defaults to {@link resolveDefaultDllPath}. */
  resolveDllPath?: () => string
}

/** Spec for the load-time export probe: each required export and its expected arity. */
const REQUIRED_EXPORTS: ReadonlyArray<{ name: keyof VdaNativeModule; arity: number }> = [
  { name: 'GetCurrentDesktopNumber', arity: 0 },
  { name: 'GetDesktopCount', arity: 0 },
  { name: 'CreateDesktop', arity: 0 },
  { name: 'RemoveDesktop', arity: 1 },
  { name: 'GoToDesktop', arity: 1 },
  { name: 'MoveWindowToDesktopNumber', arity: 2 },
  { name: 'IsWindowOnDesktopNumber', arity: 2 },
  { name: 'enumerateWindows', arity: 0 },
]

const DLL_FILE_NAME = 'VirtualDesktopAccessor.dll'
const DLL_DIR_23H2 = 'win11-23h2'
const DLL_DIR_24H2 = 'win11-24h2'

function resolveWindowsBuildNumber(): number {
  const releaseParts = os.release().split('.')
  const build = Number(releaseParts[2])
  return Number.isInteger(build) ? build : 0
}

function resolveDllVersionDirectory(): string {
  return resolveWindowsBuildNumber() >= 26100 ? DLL_DIR_24H2 : DLL_DIR_23H2
}

/**
 * Resolve the path to `VirtualDesktopAccessor.dll`, mirroring the packaged-asset
 * path strategy in `electron/main.ts`. In a packaged build the DLL ships under
 * the unpacked resources directory; in development it is resolved relative to this
 * module's `native/` folder. Electron is required lazily inside try/catch so this
 * module stays importable in non-Electron test contexts.
 */
function resolveDefaultDllPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron')
    if (electron.app?.isPackaged && process.resourcesPath) {
      return path.join(process.resourcesPath, 'agentDesktop', 'native', resolveDllVersionDirectory(), DLL_FILE_NAME)
    }
  } catch {
    // Not running inside Electron (e.g. unit tests) — fall through to the dev path.
  }
  return path.join(process.cwd(), 'electron', 'agentDesktop', 'native', resolveDllVersionDirectory(), DLL_FILE_NAME)
}

// Minimal structural view of the bits of the `koffi` API this module uses. Typed
// locally so we don't take a hard dependency on `@types/koffi`.
interface KoffiLike {
  load(filename: string): KoffiLibLike
  proto?(definition: string): unknown
  pointer?(type: unknown): unknown
  decode?(...args: unknown[]): unknown
  address?(value: unknown): number | bigint
  register?(callback: unknown, prototype: unknown): unknown
  unregister?(callback: unknown): void
}
interface KoffiLibLike {
  func(signature: string): (...args: unknown[]) => unknown
}

/**
 * Default `koffi`-backed native loader. Throws if `koffi` or the DLL is missing;
 * the binding's {@link VdaBinding.load} catches that and degrades to `unavailable`.
 *
 * Each returned function is a JS wrapper with the arity this adapter expects, so
 * the load-time probe validates the real surface the same way it validates mocks.
 * The actual enumeration uses `user32` and the DLL's `GetWindowDesktopNumber`.
 */
function defaultKoffiLoader(dllPath: string): VdaNativeModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const koffi = require('koffi') as KoffiLike

  const vda = koffi.load(dllPath)

  const rawGetCurrent = vda.func('int GetCurrentDesktopNumber()')
  const rawGetCount = vda.func('int GetDesktopCount()')
  const rawCreate = vda.func('int CreateDesktop()')
  // The real export takes (remove_desktop_number, fallback_desktop_number); the
  // wrapper supplies a sensible fallback so this adapter can call it with one arg.
  const rawRemove = vda.func('void RemoveDesktop(int remove_desktop_number, int fallback_desktop_number)')
  const rawGoTo = vda.func('void GoToDesktopNumber(int desktop_number)')
  const rawMove = vda.func('void MoveWindowToDesktopNumber(void* hwnd, int desktop_number)')
  const rawIsOn = vda.func('int IsWindowOnDesktopNumber(void* hwnd, int desktop_number)')

  const toNumber = (value: unknown): number => {
    const n = typeof value === 'bigint' ? Number(value) : Number(value)
    return Number.isFinite(n) ? n : 0
  }

  return {
    GetCurrentDesktopNumber: () => toNumber(rawGetCurrent()),
    GetDesktopCount: () => toNumber(rawGetCount()),
    CreateDesktop: () => toNumber(rawCreate()),
    RemoveDesktop: (index: number) => {
      const count = toNumber(rawGetCount())
      // Fall back to a different existing desktop (0, or 1 when removing 0).
      const fallback = index === 0 ? Math.min(1, Math.max(0, count - 1)) : 0
      rawRemove(index, fallback)
    },
    GoToDesktop: (index: number) => {
      rawGoTo(index)
    },
    MoveWindowToDesktopNumber: (hwnd: number, index: number) => {
      rawMove(hwnd, index)
    },
    IsWindowOnDesktopNumber: (hwnd: number, index: number) => toNumber(rawIsOn(hwnd, index)),
    enumerateWindows: buildKoffiEnumerator(koffi, vda),
  }
}

/**
 * Build a `user32`-backed window enumerator that tags each visible top-level
 * window with its Virtual_Desktop index via the DLL's `GetWindowDesktopNumber`.
 *
 * This is best-effort native glue: any failure throws and is surfaced by the
 * binding as a `VdaError('call-failed')`. It is never exercised in unit tests
 * (which inject a mock module), only in a real Windows + `koffi` runtime.
 */
function buildKoffiEnumerator(koffi: KoffiLike, vda: KoffiLibLike): () => VdaWindowInfo[] {
  return () => {
    const user32 = koffi.load('user32.dll')
    const isVisible = user32.func('bool IsWindowVisible(void* hwnd)')
    const getTextLen = user32.func('int GetWindowTextLengthW(void* hwnd)')
    const getText = user32.func('int GetWindowTextW(void* hwnd, _Out_ uint16_t* lpString, int nMaxCount)')
    const getThreadProcessId = user32.func('uint32 GetWindowThreadProcessId(void* hwnd, _Out_ uint32* lpdwProcessId)')
    const getWindowDesktopNumber = vda.func('int GetWindowDesktopNumber(void* hwnd)')

    const results: VdaWindowInfo[] = []

    // koffi exposes the EnumWindows callback prototype + register helpers; if these
    // capabilities are unavailable the call throws and the binding degrades.
    if (typeof koffi.proto !== 'function' || typeof koffi.register !== 'function') {
      throw new Error('koffi callback registration is unavailable')
    }

    const EnumWindowsProc = koffi.proto('bool EnumWindowsProc(void* hwnd, intptr_t lParam)')
    const enumWindows = user32.func('bool EnumWindows(void* lpEnumFunc, intptr_t lParam)')

    const callback = koffi.register((hwnd: unknown) => {
      try {
        if (!isVisible(hwnd)) return true
        const len = Number(getTextLen(hwnd))
        let title = ''
        if (len > 0) {
          const buffer = new Uint16Array(len + 1)
          getText(hwnd, buffer, len + 1)
          title = Buffer.from(buffer.buffer).toString('utf16le').replace(/\u0000+$/, '')
        }
        const pidBox = new Uint32Array(1)
        getThreadProcessId(hwnd, pidBox)
        const desktopIndex = Number(getWindowDesktopNumber(hwnd))
        const address = typeof koffi.address === 'function' ? Number(koffi.address(hwnd)) : 0
        results.push({
          hwnd: address,
          title,
          pid: pidBox[0] ?? 0,
          desktopIndex: Number.isFinite(desktopIndex) ? desktopIndex : -1,
        })
      } catch {
        // Skip any single window that fails to introspect.
      }
      return true
    }, typeof koffi.pointer === 'function' ? koffi.pointer(EnumWindowsProc) : EnumWindowsProc)

    try {
      enumWindows(callback, 0)
    } finally {
      if (typeof koffi.unregister === 'function') {
        koffi.unregister(callback)
      }
    }

    return results
  }
}

/**
 * Concrete {@link VdaBinding} implementation. Holds the loaded native module and a
 * cached load outcome; all methods fail-closed through {@link VdaError}.
 */
export class KoffiVdaBinding implements VdaBinding {
  private native: VdaNativeModule | null = null
  private outcome: VdaLoadOutcome = 'unavailable'
  private loadError: string | null = null
  private readonly loader: VdaNativeLoader
  private readonly resolveDllPath: () => string

  constructor(options: VdaBindingOptions = {}) {
    this.loader = options.loader ?? defaultKoffiLoader
    this.resolveDllPath = options.resolveDllPath ?? resolveDefaultDllPath
  }

  async load(timeoutMs: number = VDA_LOAD_TIMEOUT_MS): Promise<VdaLoadOutcome> {
    if (this.outcome === 'available' && this.native) {
      return 'available'
    }

    try {
      const native = await withTimeout(() => this.loadAndProbe(), timeoutMs)
      this.native = native
      this.outcome = 'available'
      this.loadError = null
    } catch (error) {
      this.native = null
      this.outcome = 'unavailable'
      // Record a user-visible message that explicitly names the integration (Req 8.2).
      this.loadError =
        error instanceof VdaError
          ? error.message
          : 'The VirtualDesktopAccessor virtual-desktop integration could not be loaded.'
    }

    return this.outcome
  }

  isAvailable(): boolean {
    return this.outcome === 'available' && this.native !== null
  }

  /**
   * User-visible reason the binding is unavailable, naming the VirtualDesktopAccessor
   * integration (Req 8.2). `null` while available. Not part of {@link VdaBinding};
   * consumed by the service to surface the degradation message.
   */
  getLoadError(): string | null {
    return this.loadError
  }

  getCurrentDesktopIndex(): number {
    const native = this.requireNative()
    return this.call('call-failed', () => native.GetCurrentDesktopNumber())
  }

  getDesktopCount(): number {
    const native = this.requireNative()
    return this.call('call-failed', () => native.GetDesktopCount())
  }

  createDesktop(): number {
    const native = this.requireNative()
    return this.call('call-failed', () => native.CreateDesktop())
  }

  removeDesktop(index: number): void {
    const native = this.requireNative()
    this.call('call-failed', () => native.RemoveDesktop(index))
  }

  goToDesktop(index: number): void {
    const native = this.requireNative()
    this.call('call-failed', () => native.GoToDesktop(index))
  }

  desktopExists(index: number): boolean {
    if (!Number.isInteger(index) || index < 0) {
      return false
    }
    const count = this.getDesktopCount()
    return index < count
  }

  moveWindowToDesktop(hwnd: number, index: number): void {
    const native = this.requireNative()
    this.call('call-failed', () => native.MoveWindowToDesktopNumber(hwnd, index))
  }

  isWindowOnDesktop(hwnd: number, index: number): boolean {
    const native = this.requireNative()
    return this.call('call-failed', () => native.IsWindowOnDesktopNumber(hwnd, index) === 1)
  }

  enumerateWindows(): VdaWindowInfo[] {
    const native = this.requireNative()
    if (typeof native.enumerateWindows !== 'function') {
      throw new VdaError('incompatible-api', 'VirtualDesktopAccessor window enumeration is unavailable.')
    }
    const windows = this.call('call-failed', () => native.enumerateWindows())
    return Array.isArray(windows) ? windows : []
  }

  dispose(): void {
    const native = this.native
    this.native = null
    this.outcome = 'unavailable'
    if (native && typeof native.dispose === 'function') {
      try {
        native.dispose()
      } catch {
        // Disposal is best-effort; never throw during teardown / app quit.
      }
    }
  }

  /**
   * Load the native module via the (possibly injected) loader and probe that every
   * required export exists with the expected arity. Missing module/DLL/export ⇒
   * throws a {@link VdaError} so {@link load} can degrade to `unavailable`.
   */
  private loadAndProbe(): VdaNativeModule {
    let native: VdaNativeModule
    try {
      native = this.loader(this.resolveDllPath())
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new VdaError(
        'load-failed',
        `The VirtualDesktopAccessor integration could not be loaded (${detail}).`
      )
    }

    if (!native || typeof native !== 'object') {
      throw new VdaError('load-failed', 'The VirtualDesktopAccessor integration returned no usable module.')
    }

    for (const { name, arity } of REQUIRED_EXPORTS) {
      const fn = (native as unknown as Record<string, unknown>)[name as string]
      if (typeof fn !== 'function') {
        throw new VdaError(
          'incompatible-api',
          `The VirtualDesktopAccessor integration is missing the "${String(name)}" export for this Windows build.`
        )
      }
      if ((fn as (...args: unknown[]) => unknown).length !== arity) {
        throw new VdaError(
          'incompatible-api',
          `The VirtualDesktopAccessor export "${String(name)}" has an incompatible signature for this Windows build.`
        )
      }
    }

    return native
  }

  /** Throw a `call-failed` error when a method is invoked while unavailable. */
  private requireNative(): VdaNativeModule {
    if (!this.native || this.outcome !== 'available') {
      throw new VdaError('call-failed', 'The VirtualDesktopAccessor integration is not available.')
    }
    return this.native
  }

  /**
   * Run a native call, translating any thrown native exception into a {@link VdaError}
   * with the given cause so no raw native failure escapes the binding (Req 8.3).
   */
  private call<T>(cause: VdaErrorCause, work: () => T): T {
    try {
      return work()
    } catch (error) {
      if (error instanceof VdaError) {
        throw error
      }
      const detail = error instanceof Error ? error.message : String(error)
      throw new VdaError(cause, `A VirtualDesktopAccessor call failed (${detail}).`)
    }
  }
}

/**
 * Run synchronous `work` but reject with a `load-failed` {@link VdaError} if it does
 * not settle within `timeoutMs`. Synchronous work settles immediately; the timer
 * guards against a future asynchronous loader hanging (Req 8.1 load-time bound).
 */
function withTimeout<T>(work: () => T, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new VdaError('load-failed', 'Loading the VirtualDesktopAccessor integration timed out.'))
    }, timeoutMs)

    try {
      const result = work()
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    } catch (error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
  })
}

/**
 * Factory for a {@link VdaBinding}. Pass {@link VdaBindingOptions.loader} /
 * {@link VdaBindingOptions.resolveDllPath} to inject a mock native surface in tests.
 */
export function createVdaBinding(options?: VdaBindingOptions): VdaBinding {
  return new KoffiVdaBinding(options)
}
