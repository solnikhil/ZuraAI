/**
 * Property-Based Tests for Context Selector System
 *
 *
 * These tests verify the correctness properties defined in the design document
 * for the context selector system:
 * - Property 20: Context Selector Re-render Prevention
 * - Property 29: Chat History Selector Pattern
 *
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React, { memo } from 'react'
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react'
import {
  createSelectableContext,
  shallowEqual,
  strictEqual,
  createMemoizedSelector,
  combineSelectors,
} from './createSelectableContext'

// Test state interface matching a simplified settings context
interface TestSettingsState {
  theme: 'light' | 'dark'
  fontSize: number
  apiKey: string
  modelConfig: {
    provider: string
    model: string
    temperature: number
  }
  uiState: {
    sidebarOpen: boolean
    activeTab: string
  }
}

// Arbitrary for generating test settings state
const testSettingsArbitrary = fc.record({
  theme: fc.constantFrom('light', 'dark') as fc.Arbitrary<'light' | 'dark'>,
  fontSize: fc.integer({ min: 8, max: 32 }),
  apiKey: fc.string({ minLength: 0, maxLength: 64 }),
  modelConfig: fc.record({
    provider: fc.constantFrom('openai', 'anthropic', 'google'),
    model: fc.string({ minLength: 1, maxLength: 50 }),
    temperature: fc.float({ min: 0, max: 2, noNaN: true }),
  }),
  uiState: fc.record({
    sidebarOpen: fc.boolean(),
    activeTab: fc.constantFrom('chat', 'settings', 'history'),
  }),
})

// Test state interface matching a simplified chat history context
interface TestChatState {
  sessions: Array<{
    id: string
    title: string
    messageCount: number
  }>
  currentSessionId: string | null
  isLoading: boolean
}

// Arbitrary for generating test chat state
const testChatStateArbitrary = fc.record({
  sessions: fc.array(
    fc.record({
      id: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 100 }),
      messageCount: fc.integer({ min: 0, max: 1000 }),
    }),
    { minLength: 0, maxLength: 20 }
  ),
  currentSessionId: fc.option(fc.uuid(), { nil: null }),
  isLoading: fc.boolean(),
})

describe('Context Selector Property Tests', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  /**
   *
   * *For any* settings context update via dispatch, only components that use the specific changed
   *
   */
  describe('Property 20: Context Selector Re-render Prevention', () => {
    it('should only re-render components when their selected value changes via dispatch', async () => {
      await fc.assert(
        fc.asyncProperty(
          testSettingsArbitrary,
          fc.constantFrom('theme', 'fontSize', 'apiKey') as fc.Arbitrary<
            'theme' | 'fontSize' | 'apiKey'
          >,
          async (initialState, fieldToChange) => {
            const { Provider, useSelector, useDispatch } =
              createSelectableContext<TestSettingsState>()

            const themeRenderCount = { current: 0 }
            const fontSizeRenderCount = { current: 0 }
            const apiKeyRenderCount = { current: 0 }

            const ThemeConsumer = memo(function ThemeConsumer() {
              const theme = useSelector((state) => state.theme)
              themeRenderCount.current++
              return <div data-testid="theme">{theme}</div>
            })

            const FontSizeConsumer = memo(function FontSizeConsumer() {
              const fontSize = useSelector((state) => state.fontSize)
              fontSizeRenderCount.current++
              return <div data-testid="fontSize">{fontSize}</div>
            })

            const ApiKeyConsumer = memo(function ApiKeyConsumer() {
              const apiKey = useSelector((state) => state.apiKey)
              apiKeyRenderCount.current++
              return <div data-testid="apiKey">{apiKey}</div>
            })

            function Controls() {
              const dispatch = useDispatch()
              return (
                <>
                  <button
                    data-testid="change-theme"
                    onClick={() =>
                      dispatch((prev) => ({
                        ...prev,
                        theme: prev.theme === 'light' ? 'dark' : 'light',
                      }))
                    }
                  >
                    Change Theme
                  </button>
                  <button
                    data-testid="change-fontSize"
                    onClick={() =>
                      dispatch((prev) => ({
                        ...prev,
                        fontSize: prev.fontSize + 1,
                      }))
                    }
                  >
                    Change Font Size
                  </button>
                  <button
                    data-testid="change-apiKey"
                    onClick={() =>
                      dispatch((prev) => ({
                        ...prev,
                        apiKey: prev.apiKey + 'x',
                      }))
                    }
                  >
                    Change API Key
                  </button>
                </>
              )
            }

            render(
              <Provider value={initialState}>
                <Controls />
                <ThemeConsumer />
                <FontSizeConsumer />
                <ApiKeyConsumer />
              </Provider>
            )

            // Record initial render counts
            const initialThemeRenders = themeRenderCount.current
            const initialFontSizeRenders = fontSizeRenderCount.current
            const initialApiKeyRenders = apiKeyRenderCount.current

            // Change the specified field
            await act(async () => {
              fireEvent.click(screen.getByTestId(`change-${fieldToChange}`))
            })

            // Property: Only the component for the changed field should re-render
            if (fieldToChange === 'theme') {
              expect(themeRenderCount.current).toBe(initialThemeRenders + 1)
              expect(fontSizeRenderCount.current).toBe(initialFontSizeRenders)
              expect(apiKeyRenderCount.current).toBe(initialApiKeyRenders)
            } else if (fieldToChange === 'fontSize') {
              expect(themeRenderCount.current).toBe(initialThemeRenders)
              expect(fontSizeRenderCount.current).toBe(initialFontSizeRenders + 1)
              expect(apiKeyRenderCount.current).toBe(initialApiKeyRenders)
            } else {
              expect(themeRenderCount.current).toBe(initialThemeRenders)
              expect(fontSizeRenderCount.current).toBe(initialFontSizeRenders)
              expect(apiKeyRenderCount.current).toBe(initialApiKeyRenders + 1)
            }

            cleanup()
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should prevent re-renders when using shallowEqual for object selectors', async () => {
      await fc.assert(
        fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
          const { Provider, useSelector, useDispatch } =
            createSelectableContext<TestSettingsState>()

          const modelConfigRenderCount = { current: 0 }

          const ModelConfigConsumer = memo(function ModelConfigConsumer() {
            const modelConfig = useSelector((state) => state.modelConfig, shallowEqual)
            modelConfigRenderCount.current++
            return <div data-testid="model">{modelConfig.model}</div>
          })

          function Controls() {
            const dispatch = useDispatch()
            return (
              <>
                <button
                  data-testid="same-config"
                  onClick={() =>
                    dispatch((prev) => ({
                      ...prev,
                      theme: prev.theme === 'light' ? 'dark' : 'light', // Change something else
                      modelConfig: { ...prev.modelConfig }, // Same values, new reference
                    }))
                  }
                >
                  Same Config
                </button>
                <button
                  data-testid="new-temp"
                  onClick={() =>
                    dispatch((prev) => ({
                      ...prev,
                      modelConfig: {
                        ...prev.modelConfig,
                        temperature: prev.modelConfig.temperature + 0.1,
                      },
                    }))
                  }
                >
                  New Temperature
                </button>
              </>
            )
          }

          render(
            <Provider value={initialState}>
              <Controls />
              <ModelConfigConsumer />
            </Provider>
          )

          const initialRenders = modelConfigRenderCount.current

          // Update with same modelConfig values but new object reference
          await act(async () => {
            fireEvent.click(screen.getByTestId('same-config'))
          })

          // Property: Should NOT re-render because modelConfig values are the same
          expect(modelConfigRenderCount.current).toBe(initialRenders)

          // Update with different temperature
          await act(async () => {
            fireEvent.click(screen.getByTestId('new-temp'))
          })

          // Property: Should re-render because temperature changed
          expect(modelConfigRenderCount.current).toBe(initialRenders + 1)

          cleanup()
        }),
        { numRuns: 50 }
      )
    })
  })

  /**
   *
   * re-render when the selected value changes.
   *
   */
  describe('Property 29: Chat History Selector Pattern', () => {
    it('should only re-render session list component when sessions change via dispatch', async () => {
      await fc.assert(
        fc.asyncProperty(
          testChatStateArbitrary,
          fc.constantFrom('sessions', 'currentSessionId', 'isLoading') as fc.Arbitrary<
            'sessions' | 'currentSessionId' | 'isLoading'
          >,
          async (initialState, fieldToChange) => {
            const { Provider, useSelector, useDispatch } = createSelectableContext<TestChatState>()

            const sessionsRenderCount = { current: 0 }
            const currentSessionRenderCount = { current: 0 }
            const loadingRenderCount = { current: 0 }

            const SessionsListConsumer = memo(function SessionsListConsumer() {
              const sessions = useSelector((state) => state.sessions)
              sessionsRenderCount.current++
              return <div data-testid="sessions">{sessions.length}</div>
            })

            const CurrentSessionConsumer = memo(function CurrentSessionConsumer() {
              const currentSessionId = useSelector((state) => state.currentSessionId)
              currentSessionRenderCount.current++
              return <div data-testid="current">{currentSessionId || 'none'}</div>
            })

            const LoadingConsumer = memo(function LoadingConsumer() {
              const isLoading = useSelector((state) => state.isLoading)
              loadingRenderCount.current++
              return <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            })

            function Controls() {
              const dispatch = useDispatch()
              return (
                <>
                  <button
                    data-testid="change-sessions"
                    onClick={() =>
                      dispatch((prev) => ({
                        ...prev,
                        sessions: [...prev.sessions, { id: 'new', title: 'New', messageCount: 0 }],
                      }))
                    }
                  >
                    Add Session
                  </button>
                  <button
                    data-testid="change-currentSessionId"
                    onClick={() =>
                      dispatch((prev) => ({
                        ...prev,
                        currentSessionId: prev.currentSessionId ? null : 'test-id',
                      }))
                    }
                  >
                    Toggle Current
                  </button>
                  <button
                    data-testid="change-isLoading"
                    onClick={() =>
                      dispatch((prev) => ({
                        ...prev,
                        isLoading: !prev.isLoading,
                      }))
                    }
                  >
                    Toggle Loading
                  </button>
                </>
              )
            }

            render(
              <Provider value={initialState}>
                <Controls />
                <SessionsListConsumer />
                <CurrentSessionConsumer />
                <LoadingConsumer />
              </Provider>
            )

            const initialSessionsRenders = sessionsRenderCount.current
            const initialCurrentSessionRenders = currentSessionRenderCount.current
            const initialLoadingRenders = loadingRenderCount.current

            await act(async () => {
              fireEvent.click(screen.getByTestId(`change-${fieldToChange}`))
            })

            // Property: Each component should only re-render if its selected value changed
            if (fieldToChange === 'sessions') {
              expect(sessionsRenderCount.current).toBe(initialSessionsRenders + 1)
              expect(currentSessionRenderCount.current).toBe(initialCurrentSessionRenders)
              expect(loadingRenderCount.current).toBe(initialLoadingRenders)
            } else if (fieldToChange === 'currentSessionId') {
              expect(sessionsRenderCount.current).toBe(initialSessionsRenders)
              expect(currentSessionRenderCount.current).toBe(initialCurrentSessionRenders + 1)
              expect(loadingRenderCount.current).toBe(initialLoadingRenders)
            } else {
              expect(sessionsRenderCount.current).toBe(initialSessionsRenders)
              expect(currentSessionRenderCount.current).toBe(initialCurrentSessionRenders)
              expect(loadingRenderCount.current).toBe(initialLoadingRenders + 1)
            }

            cleanup()
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  /**
   * Additional property tests for selector system correctness
   */
  describe('Selector System Correctness Properties', () => {
    it('should maintain referential stability for unchanged selected values', async () => {
      await fc.assert(
        fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
          const { Provider, useSelector, useDispatch } =
            createSelectableContext<TestSettingsState>()

          const selectedValues: string[] = []

          const Consumer = memo(function Consumer() {
            const theme = useSelector((state) => state.theme)
            selectedValues.push(theme)
            return <div data-testid="theme">{theme}</div>
          })

          function Controls() {
            const dispatch = useDispatch()
            return (
              <button
                data-testid="change-fontSize"
                onClick={() => dispatch((prev) => ({ ...prev, fontSize: prev.fontSize + 1 }))}
              >
                Change Font Size
              </button>
            )
          }

          render(
            <Provider value={initialState}>
              <Controls />
              <Consumer />
            </Provider>
          )

          // Update something other than theme
          await act(async () => {
            fireEvent.click(screen.getByTestId('change-fontSize'))
          })

          // Property: Selected value should remain the same (only 1 render)
          expect(selectedValues.length).toBe(1)
          expect(selectedValues[0]).toBe(initialState.theme)

          cleanup()
        }),
        { numRuns: 50 }
      )
    })

    it('should handle rapid state updates correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          testSettingsArbitrary,
          fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 3, maxLength: 10 }),
          async (initialState, increments) => {
            const { Provider, useSelector, useDispatch } =
              createSelectableContext<TestSettingsState>()

            let lastSeenFontSize = initialState.fontSize

            const Consumer = memo(function Consumer() {
              const fontSize = useSelector((state) => state.fontSize)
              lastSeenFontSize = fontSize
              return <div data-testid="fontSize">{fontSize}</div>
            })

            function Controls() {
              const dispatch = useDispatch()
              return (
                <button
                  data-testid="increment"
                  onClick={() => dispatch((prev) => ({ ...prev, fontSize: prev.fontSize + 1 }))}
                >
                  Increment
                </button>
              )
            }

            render(
              <Provider value={initialState}>
                <Controls />
                <Consumer />
              </Provider>
            )

            // Apply rapid updates
            for (let i = 0; i < increments.length; i++) {
              await act(async () => {
                fireEvent.click(screen.getByTestId('increment'))
              })
            }

            // Property: Final selected value should match expected
            const expectedFinalFontSize = initialState.fontSize + increments.length
            expect(lastSeenFontSize).toBe(expectedFinalFontSize)

            cleanup()
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should work correctly with memoized selectors', async () => {
      await fc.assert(
        fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
          const { Provider, useSelector, useDispatch } =
            createSelectableContext<TestSettingsState>()

          // Create a memoized selector
          const selectModelInfo = createMemoizedSelector(
            (state: TestSettingsState) => state.modelConfig,
            (config) => `${config.provider}/${config.model}`
          )

          const renderCount = { current: 0 }
          let lastModelInfo = ''

          const Consumer = memo(function Consumer() {
            const modelInfo = useSelector(selectModelInfo)
            renderCount.current++
            lastModelInfo = modelInfo
            return <div data-testid="modelInfo">{modelInfo}</div>
          })

          function Controls() {
            const dispatch = useDispatch()
            return (
              <button
                data-testid="change-theme"
                onClick={() =>
                  dispatch((prev) => ({
                    ...prev,
                    theme: prev.theme === 'light' ? 'dark' : 'light',
                  }))
                }
              >
                Change Theme
              </button>
            )
          }

          render(
            <Provider value={initialState}>
              <Controls />
              <Consumer />
            </Provider>
          )

          const initialRenders = renderCount.current
          const expectedModelInfo = `${initialState.modelConfig.provider}/${initialState.modelConfig.model}`

          // Property: Initial render should have correct value
          expect(lastModelInfo).toBe(expectedModelInfo)

          // Update something unrelated
          await act(async () => {
            fireEvent.click(screen.getByTestId('change-theme'))
          })

          // Property: Should not re-render for unrelated changes
          expect(renderCount.current).toBe(initialRenders)

          cleanup()
        }),
        { numRuns: 50 }
      )
    })

    it('should work correctly with combined selectors', async () => {
      await fc.assert(
        fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
          const { Provider, useSelector } = createSelectableContext<TestSettingsState>()

          // Create a combined selector
          const selectThemeAndFontSize = combineSelectors(
            (state: TestSettingsState) => state.theme,
            (state: TestSettingsState) => state.fontSize,
            (theme, fontSize) => ({ theme, fontSize })
          )

          let lastCombined = { theme: '' as 'light' | 'dark', fontSize: 0 }

          function Consumer() {
            const combined = useSelector(selectThemeAndFontSize)
            lastCombined = combined
            return (
              <div data-testid="combined">
                {combined.theme}-{combined.fontSize}
              </div>
            )
          }

          render(
            <Provider value={initialState}>
              <Consumer />
            </Provider>
          )

          // Property: Combined selector should return correct values
          expect(lastCombined.theme).toBe(initialState.theme)
          expect(lastCombined.fontSize).toBe(initialState.fontSize)

          cleanup()
        }),
        { numRuns: 50 }
      )
    })
  })
})

describe('shallowEqual Property Tests', () => {
  it('should be reflexive: shallowEqual(a, a) === true', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expect(shallowEqual(value, value)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should be symmetric: shallowEqual(a, b) === shallowEqual(b, a)', () => {
    fc.assert(
      fc.property(
        fc.record({
          a: fc.integer(),
          b: fc.string(),
        }),
        fc.record({
          a: fc.integer(),
          b: fc.string(),
        }),
        (obj1, obj2) => {
          expect(shallowEqual(obj1, obj2)).toBe(shallowEqual(obj2, obj1))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should correctly compare objects with same structure', () => {
    fc.assert(
      fc.property(
        fc.record({
          num: fc.integer(),
          str: fc.string(),
          bool: fc.boolean(),
        }),
        (obj) => {
          const copy = { ...obj }
          expect(shallowEqual(obj, copy)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should detect differences in object values', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer().filter((n) => n !== 0), // Ensure different
        (base, diff) => {
          const obj1 = { value: base }
          const obj2 = { value: base + diff }
          expect(shallowEqual(obj1, obj2)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('strictEqual Property Tests', () => {
  it('should be reflexive: strictEqual(a, a) === true', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        expect(strictEqual(value, value)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should return false for different object references with same values', () => {
    fc.assert(
      fc.property(
        fc.record({
          a: fc.integer(),
          b: fc.string(),
        }),
        (obj) => {
          const copy = { ...obj }
          expect(strictEqual(obj, copy)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle NaN correctly', () => {
    expect(strictEqual(NaN, NaN)).toBe(true)
  })
})

/**
 *
 * single React render cycle (batched).
 *
 *
 * React 18+ automatic batching ensures that multiple state updates within the
 * same event handler, setTimeout, Promise, or native event handler are batched
 * into a single render cycle. This test verifies that behavior.
 *
 * Note: This test validates the React 18+ automatic batching behavior that is
 * enabled by using ReactDOM.createRoot() in src/main.tsx.
 */
describe('Property 32: Batched Context Updates', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * Test that multiple context updates in the same event handler result in
   * a single render cycle.
   */
  it('should batch multiple context updates into a single render cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        testSettingsArbitrary,
        testChatStateArbitrary,
        async (settingsState, chatState) => {
          // Create two separate contexts to simulate multiple context updates
          const {
            Provider: SettingsProvider,
            useSelector: useSettingsSelector,
            useDispatch: useSettingsDispatch,
          } = createSelectableContext<TestSettingsState>()

          const {
            Provider: ChatProvider,
            useSelector: useChatSelector,
            useDispatch: useChatDispatch,
          } = createSelectableContext<TestChatState>()

          // Track render counts for a component that uses both contexts
          const combinedRenderCount = { current: 0 }

          // Component that subscribes to both contexts
          const CombinedConsumer = memo(function CombinedConsumer() {
            const theme = useSettingsSelector((state) => state.theme)
            const isLoading = useChatSelector((state) => state.isLoading)
            combinedRenderCount.current++
            return (
              <div data-testid="combined">
                {theme}-{isLoading ? 'loading' : 'ready'}
              </div>
            )
          })

          // Component that triggers updates to both contexts simultaneously
          function MultiContextUpdater() {
            const settingsDispatch = useSettingsDispatch()
            const chatDispatch = useChatDispatch()

            const handleBatchedUpdate = () => {
              // React 18+ batches these updates automatically
              // Both updates should result in a single render cycle
              settingsDispatch((prev) => ({
                ...prev,
                theme: prev.theme === 'light' ? 'dark' : 'light',
              }))
              chatDispatch((prev) => ({
                ...prev,
                isLoading: !prev.isLoading,
              }))
            }

            return (
              <button data-testid="batch-update" onClick={handleBatchedUpdate}>
                Batch Update
              </button>
            )
          }

          render(
            <SettingsProvider value={settingsState}>
              <ChatProvider value={chatState}>
                <MultiContextUpdater />
                <CombinedConsumer />
              </ChatProvider>
            </SettingsProvider>
          )

          // Record initial render count (should be 1 from initial render)
          const initialRenders = combinedRenderCount.current
          expect(initialRenders).toBe(1)

          // Trigger batched update to both contexts
          await act(async () => {
            fireEvent.click(screen.getByTestId('batch-update'))
          })

          // Property: Both context updates should result in a single additional render
          // If batching wasn't working, we'd see 2 additional renders (one per context)
          // With React 18+ batching, we should see only 1 additional render
          expect(combinedRenderCount.current).toBe(initialRenders + 1)

          cleanup()
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Test that batching works correctly in async contexts (setTimeout)
   */
  it('should batch updates in setTimeout callbacks (React 18+ feature)', async () => {
    await fc.assert(
      fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
        const { Provider, useSelector, useDispatch } = createSelectableContext<TestSettingsState>()

        const renderCount = { current: 0 }

        const Consumer = memo(function Consumer() {
          const theme = useSelector((state) => state.theme)
          const fontSize = useSelector((state) => state.fontSize)
          renderCount.current++
          return (
            <div data-testid="values">
              {theme}-{fontSize}
            </div>
          )
        })

        function AsyncUpdater() {
          const dispatch = useDispatch()

          const handleAsyncUpdate = () => {
            // React 18+ batches updates in setTimeout too
            setTimeout(() => {
              dispatch((prev) => ({
                ...prev,
                theme: prev.theme === 'light' ? 'dark' : 'light',
              }))
              dispatch((prev) => ({
                ...prev,
                fontSize: prev.fontSize + 1,
              }))
            }, 0)
          }

          return (
            <button data-testid="async-update" onClick={handleAsyncUpdate}>
              Async Update
            </button>
          )
        }

        render(
          <Provider value={initialState}>
            <AsyncUpdater />
            <Consumer />
          </Provider>
        )

        const initialRenders = renderCount.current

        // Trigger async batched update
        await act(async () => {
          fireEvent.click(screen.getByTestId('async-update'))
          // Wait for setTimeout to execute
          await new Promise((resolve) => setTimeout(resolve, 10))
        })

        // Property: Both updates in setTimeout should be batched into single render
        // React 18+ batches updates in setTimeout (unlike React 17)
        expect(renderCount.current).toBe(initialRenders + 1)

        cleanup()
      }),
      { numRuns: 50 }
    )
  })

  /**
   * Test that batching works correctly in Promise callbacks
   */
  it('should batch updates in Promise callbacks (React 18+ feature)', async () => {
    await fc.assert(
      fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
        const { Provider, useSelector, useDispatch } = createSelectableContext<TestSettingsState>()

        const renderCount = { current: 0 }

        const Consumer = memo(function Consumer() {
          const theme = useSelector((state) => state.theme)
          const apiKey = useSelector((state) => state.apiKey)
          renderCount.current++
          return (
            <div data-testid="values">
              {theme}-{apiKey.length}
            </div>
          )
        })

        function PromiseUpdater() {
          const dispatch = useDispatch()

          const handlePromiseUpdate = () => {
            // React 18+ batches updates in Promise callbacks too
            Promise.resolve().then(() => {
              dispatch((prev) => ({
                ...prev,
                theme: prev.theme === 'light' ? 'dark' : 'light',
              }))
              dispatch((prev) => ({
                ...prev,
                apiKey: prev.apiKey + 'x',
              }))
            })
          }

          return (
            <button data-testid="promise-update" onClick={handlePromiseUpdate}>
              Promise Update
            </button>
          )
        }

        render(
          <Provider value={initialState}>
            <PromiseUpdater />
            <Consumer />
          </Provider>
        )

        const initialRenders = renderCount.current

        // Trigger promise-based batched update
        await act(async () => {
          fireEvent.click(screen.getByTestId('promise-update'))
          // Wait for Promise to resolve
          await new Promise((resolve) => setTimeout(resolve, 10))
        })

        // Property: Both updates in Promise callback should be batched
        expect(renderCount.current).toBe(initialRenders + 1)

        cleanup()
      }),
      { numRuns: 50 }
    )
  })

  /**
   * Test that multiple rapid updates are batched correctly
   */
  it('should batch multiple rapid sequential updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        testSettingsArbitrary,
        fc.integer({ min: 3, max: 10 }),
        async (initialState, updateCount) => {
          const { Provider, useSelector, useDispatch } =
            createSelectableContext<TestSettingsState>()

          const renderCount = { current: 0 }
          let lastFontSize = initialState.fontSize

          const Consumer = memo(function Consumer() {
            const fontSize = useSelector((state) => state.fontSize)
            renderCount.current++
            lastFontSize = fontSize
            return <div data-testid="fontSize">{fontSize}</div>
          })

          function RapidUpdater() {
            const dispatch = useDispatch()

            const handleRapidUpdates = () => {
              // Multiple updates in same event handler should be batched
              for (let i = 0; i < updateCount; i++) {
                dispatch((prev) => ({
                  ...prev,
                  fontSize: prev.fontSize + 1,
                }))
              }
            }

            return (
              <button data-testid="rapid-update" onClick={handleRapidUpdates}>
                Rapid Update
              </button>
            )
          }

          render(
            <Provider value={initialState}>
              <RapidUpdater />
              <Consumer />
            </Provider>
          )

          const initialRenders = renderCount.current

          // Trigger rapid updates
          await act(async () => {
            fireEvent.click(screen.getByTestId('rapid-update'))
          })

          // Property: All rapid updates should be batched into single render
          expect(renderCount.current).toBe(initialRenders + 1)

          // Property: Final value should reflect all updates
          expect(lastFontSize).toBe(initialState.fontSize + updateCount)

          cleanup()
        }
      ),
      { numRuns: 50 }
    )
  })
})

/**
 *
 * *For any* context provider re-render with unchanged value, child components
 *
 *
 * This property verifies that context providers properly memoize their values
 * using useMemo, preventing unnecessary re-renders of child components when
 * the provider re-renders but the value hasn't changed.
 */
describe('Property 30: Context Provider Memoization', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * Test that child components don't re-render when provider re-renders
   * with the same value reference.
   */
  it('should not re-render children when provider re-renders with same value reference', async () => {
    await fc.assert(
      fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
        const { Provider, useSelector } = createSelectableContext<TestSettingsState>()

        const childRenderCount = { current: 0 }

        // Memoized child component that uses selector
        const MemoizedChild = memo(function MemoizedChild() {
          const theme = useSelector((state) => state.theme)
          childRenderCount.current++
          return <div data-testid="theme">{theme}</div>
        })

        // Parent component that can force re-renders
        function ParentWithForceUpdate() {
          const [, forceUpdate] = React.useState(0)

          return (
            <Provider value={initialState}>
              <button data-testid="force-update" onClick={() => forceUpdate((n) => n + 1)}>
                Force Update
              </button>
              <MemoizedChild />
            </Provider>
          )
        }

        render(<ParentWithForceUpdate />)

        const initialRenders = childRenderCount.current
        expect(initialRenders).toBe(1)

        // Force parent to re-render (but value reference stays the same)
        await act(async () => {
          fireEvent.click(screen.getByTestId('force-update'))
        })

        // Property: Child should NOT re-render because value reference is unchanged
        // The Provider's useMemo ensures the context value is stable
        expect(childRenderCount.current).toBe(initialRenders)

        cleanup()
      }),
      { numRuns: 50 }
    )
  })

  /**
   * Test that child components re-render only when the selected value changes,
   * not when other parts of the context change.
   */
  it('should only re-render children when their selected value changes', async () => {
    await fc.assert(
      fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
        const { Provider, useSelector, useDispatch } = createSelectableContext<TestSettingsState>()

        const themeRenderCount = { current: 0 }
        const fontSizeRenderCount = { current: 0 }

        // Component that only cares about theme
        const ThemeConsumer = memo(function ThemeConsumer() {
          const theme = useSelector((state) => state.theme)
          themeRenderCount.current++
          return <div data-testid="theme">{theme}</div>
        })

        // Component that only cares about fontSize
        const FontSizeConsumer = memo(function FontSizeConsumer() {
          const fontSize = useSelector((state) => state.fontSize)
          fontSizeRenderCount.current++
          return <div data-testid="fontSize">{fontSize}</div>
        })

        function Controls() {
          const dispatch = useDispatch()
          return (
            <button
              data-testid="change-apiKey"
              onClick={() =>
                dispatch((prev) => ({
                  ...prev,
                  apiKey: prev.apiKey + 'x',
                }))
              }
            >
              Change API Key
            </button>
          )
        }

        render(
          <Provider value={initialState}>
            <Controls />
            <ThemeConsumer />
            <FontSizeConsumer />
          </Provider>
        )

        const initialThemeRenders = themeRenderCount.current
        const initialFontSizeRenders = fontSizeRenderCount.current

        // Change apiKey (neither theme nor fontSize)
        await act(async () => {
          fireEvent.click(screen.getByTestId('change-apiKey'))
        })

        // Property: Neither component should re-render because their selected values didn't change
        expect(themeRenderCount.current).toBe(initialThemeRenders)
        expect(fontSizeRenderCount.current).toBe(initialFontSizeRenders)

        cleanup()
      }),
      { numRuns: 50 }
    )
  })

  /**
   * Test that context provider memoization works with nested providers.
   */
  it('should maintain memoization with nested context providers', async () => {
    await fc.assert(
      fc.asyncProperty(
        testSettingsArbitrary,
        testChatStateArbitrary,
        async (settingsState, chatState) => {
          const { Provider: SettingsProvider, useSelector: useSettingsSelector } =
            createSelectableContext<TestSettingsState>()

          const {
            Provider: ChatProvider,
            useSelector: useChatSelector,
            useDispatch: useChatDispatch,
          } = createSelectableContext<TestChatState>()

          const settingsRenderCount = { current: 0 }
          const chatRenderCount = { current: 0 }

          // Component using outer context (settings)
          const SettingsConsumer = memo(function SettingsConsumer() {
            const theme = useSettingsSelector((state) => state.theme)
            settingsRenderCount.current++
            return <div data-testid="theme">{theme}</div>
          })

          // Component using inner context (chat)
          const ChatConsumer = memo(function ChatConsumer() {
            const isLoading = useChatSelector((state) => state.isLoading)
            chatRenderCount.current++
            return <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
          })

          function Controls() {
            const dispatch = useChatDispatch()
            return (
              <button
                data-testid="toggle-loading"
                onClick={() =>
                  dispatch((prev) => ({
                    ...prev,
                    isLoading: !prev.isLoading,
                  }))
                }
              >
                Toggle Loading
              </button>
            )
          }

          render(
            <SettingsProvider value={settingsState}>
              <ChatProvider value={chatState}>
                <Controls />
                <SettingsConsumer />
                <ChatConsumer />
              </ChatProvider>
            </SettingsProvider>
          )

          const initialSettingsRenders = settingsRenderCount.current
          const initialChatRenders = chatRenderCount.current

          // Change chat state (inner context)
          await act(async () => {
            fireEvent.click(screen.getByTestId('toggle-loading'))
          })

          // Property: Settings consumer should NOT re-render (outer context unchanged)
          expect(settingsRenderCount.current).toBe(initialSettingsRenders)

          // Property: Chat consumer SHOULD re-render (its selected value changed)
          expect(chatRenderCount.current).toBe(initialChatRenders + 1)

          cleanup()
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Test that memoization works correctly with object values using shallowEqual.
   */
  it('should prevent re-renders when using shallowEqual for unchanged object values', async () => {
    await fc.assert(
      fc.asyncProperty(testSettingsArbitrary, async (initialState) => {
        const { Provider, useSelector, useDispatch } = createSelectableContext<TestSettingsState>()

        const modelConfigRenderCount = { current: 0 }

        // Component using shallowEqual for object comparison
        const ModelConfigConsumer = memo(function ModelConfigConsumer() {
          const modelConfig = useSelector((state) => state.modelConfig, shallowEqual)
          modelConfigRenderCount.current++
          return <div data-testid="model">{modelConfig.model}</div>
        })

        function Controls() {
          const dispatch = useDispatch()
          return (
            <>
              <button
                data-testid="change-theme"
                onClick={() =>
                  dispatch((prev) => ({
                    ...prev,
                    theme: prev.theme === 'light' ? 'dark' : 'light',
                  }))
                }
              >
                Change Theme
              </button>
              <button
                data-testid="recreate-config"
                onClick={() =>
                  dispatch((prev) => ({
                    ...prev,
                    // Create new object reference with same values
                    modelConfig: { ...prev.modelConfig },
                  }))
                }
              >
                Recreate Config
              </button>
            </>
          )
        }

        render(
          <Provider value={initialState}>
            <Controls />
            <ModelConfigConsumer />
          </Provider>
        )

        const initialRenders = modelConfigRenderCount.current

        // Change theme (unrelated to modelConfig)
        await act(async () => {
          fireEvent.click(screen.getByTestId('change-theme'))
        })

        // Property: Should NOT re-render (modelConfig unchanged)
        expect(modelConfigRenderCount.current).toBe(initialRenders)

        // Recreate modelConfig with same values but new reference
        await act(async () => {
          fireEvent.click(screen.getByTestId('recreate-config'))
        })

        // Property: Should NOT re-render (shallowEqual detects same values)
        expect(modelConfigRenderCount.current).toBe(initialRenders)

        cleanup()
      }),
      { numRuns: 50 }
    )
  })
})
