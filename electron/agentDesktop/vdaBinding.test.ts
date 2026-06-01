/**
 * Integration tests for the VirtualDesktopAccessor FFI adapter load outcome
 * (`vdaBinding.ts`), with the native FFI surface fully mocked through the
 * constructor seam ({@link VdaBindingOptions}). These are example-based tests
 * (not property tests): they assert the concrete load outcomes the design calls
 * out for a healthy module, a missing module/DLL, and an incompatible module.
 *
 * No real `koffi` and no real `VirtualDesktopAccessor.dll` are required — the
 * loader and DLL-path resolver are injected.
 *
 * _Requirements: 8.1, 8.2_
 */

import { describe, it, expect } from 'vitest'

import { createVdaBinding } from './vdaBinding'
import type { KoffiVdaBinding } from './vdaBinding'
import type { VdaNativeModule, VdaWindowInfo } from './vdaBinding'

const MOCK_DLL_PATH = 'C:/mock/agentDesktop/native/VirtualDesktopAccessor.dll'

/**
 * A complete, correct-arity native module. Every required export is present and
 * declares exactly the arity the load-time probe expects.
 */
function makeCompleteNative(): VdaNativeModule {
  return {
    GetCurrentDesktopNumber: () => 0,
    GetDesktopCount: () => 2,
    CreateDesktop: () => 1,
    RemoveDesktop: (_index: number) => {},
    GoToDesktop: (_index: number) => {},
    MoveWindowToDesktopNumber: (_hwnd: number, _index: number) => {},
    IsWindowOnDesktopNumber: (_hwnd: number, _index: number) => 1,
    enumerateWindows: (): VdaWindowInfo[] => [],
  }
}

describe('VdaBinding load outcome (mocked FFI)', () => {
  // (a) A complete, correct-arity native module → load resolves 'available'.
  it('resolves to "available" when the loader returns a complete, correct-arity module', async () => {
    const binding = createVdaBinding({
      loader: () => makeCompleteNative(),
      resolveDllPath: () => MOCK_DLL_PATH,
    })

    const outcome = await binding.load()

    expect(outcome).toBe('available')
    expect(binding.isAvailable()).toBe(true)
    // Native methods are reachable and return values.
    expect(binding.getDesktopCount()).toBe(2)
    expect(binding.getCurrentDesktopIndex()).toBe(0)

    // getLoadError() is null while available.
    expect((binding as KoffiVdaBinding).getLoadError()).toBeNull()
  })

  // (b) A loader that throws (missing module / DLL) → 'unavailable', with a
  //     user-visible message naming VirtualDesktopAccessor.
  it('resolves to "unavailable" when the loader throws (missing module/DLL)', async () => {
    const binding = createVdaBinding({
      loader: () => {
        throw new Error("Cannot find module 'koffi'")
      },
      resolveDllPath: () => MOCK_DLL_PATH,
    })

    const outcome = await binding.load()

    expect(outcome).toBe('unavailable')
    expect(binding.isAvailable()).toBe(false)

    const message = (binding as KoffiVdaBinding).getLoadError()
    expect(message).not.toBeNull()
    expect(message).toContain('VirtualDesktopAccessor')
  })

  it('also resolves to "unavailable" when the loader returns no usable module', async () => {
    const binding = createVdaBinding({
      // Loader returns a non-object: the probe must treat this as a load failure.
      loader: () => null as unknown as VdaNativeModule,
      resolveDllPath: () => MOCK_DLL_PATH,
    })

    const outcome = await binding.load()

    expect(outcome).toBe('unavailable')
    expect(binding.isAvailable()).toBe(false)
    expect((binding as KoffiVdaBinding).getLoadError()).toContain('VirtualDesktopAccessor')
  })

  // (c) A module MISSING a required export → 'unavailable' with an
  //     incompatible-api style message naming the integration.
  it('resolves to "unavailable" when a required export is missing', async () => {
    const incomplete = makeCompleteNative() as Partial<VdaNativeModule>
    // Drop a required export.
    delete incomplete.MoveWindowToDesktopNumber

    const binding = createVdaBinding({
      loader: () => incomplete as VdaNativeModule,
      resolveDllPath: () => MOCK_DLL_PATH,
    })

    const outcome = await binding.load()

    expect(outcome).toBe('unavailable')
    expect(binding.isAvailable()).toBe(false)

    const message = (binding as KoffiVdaBinding).getLoadError()
    expect(message).not.toBeNull()
    expect(message).toContain('VirtualDesktopAccessor')
    // The message identifies the missing export for this Windows build.
    expect(message).toContain('MoveWindowToDesktopNumber')
  })

  // (c, wrong arity) A module whose export has the wrong arity → 'unavailable'
  //     with an incompatible-signature message naming the integration.
  it('resolves to "unavailable" when a required export has the wrong arity', async () => {
    const wrongArity = makeCompleteNative() as Record<string, unknown>
    // GoToDesktop must accept exactly 1 argument; give it 0.
    wrongArity.GoToDesktop = () => {}

    const binding = createVdaBinding({
      loader: () => wrongArity as unknown as VdaNativeModule,
      resolveDllPath: () => MOCK_DLL_PATH,
    })

    const outcome = await binding.load()

    expect(outcome).toBe('unavailable')
    expect(binding.isAvailable()).toBe(false)

    const message = (binding as KoffiVdaBinding).getLoadError()
    expect(message).not.toBeNull()
    expect(message).toContain('VirtualDesktopAccessor')
    expect(message).toContain('GoToDesktop')
  })

  it('calling a native method while unavailable throws VdaError(call-failed) rather than crashing', async () => {
    const binding = createVdaBinding({
      loader: () => {
        throw new Error('no native module')
      },
      resolveDllPath: () => MOCK_DLL_PATH,
    })

    await binding.load()
    expect(binding.isAvailable()).toBe(false)

    // Methods must fail closed with a VdaError, never an unguarded crash.
    expect(() => binding.getDesktopCount()).toThrowError(/VirtualDesktopAccessor/)
  })
})
