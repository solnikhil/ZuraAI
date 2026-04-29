/**
 * Context Selector System for Performance Optimization
 *
 * This module provides a selector-based context pattern that allows components
 * to subscribe to specific parts of context state, preventing unnecessary re-renders.
 *
 *   trigger re-renders in components that use the changed value
 *   allow components to subscribe to specific session data
 *
 * Key Features:
 * - Selector-based subscriptions: Components only re-render when selected value changes
 * - Custom equality comparison: Support for shallow/deep equality checks
 * - React 18 concurrent mode compatible: Uses useSyncExternalStore
 * - Type-safe: Full TypeScript support with generics
 *
 * Implementation Note:
 * This implementation uses an external store pattern similar to Zustand. The Provider
 * creates a store that persists across renders. When the value prop changes, the store
 * is updated and subscribers are notified. Components using useSelector will only
 * re-render if their selected value has changed.
 *
 * Important: The selector pattern prevents re-renders when the STORE changes, not when
 * the parent component re-renders. If you need to prevent parent re-renders from
 * propagating, wrap consumer components in React.memo.
 *
 */

import React, {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
  useEffect,
  useLayoutEffect,
} from 'react'

/**
 * Selector function type that extracts a value from state
 */
export type Selector<T, R> = (state: T) => R

/**
 * Equality function type for comparing selected values
 */
export type EqualityFn<R> = (a: R, b: R) => boolean

/**
 * Default shallow equality comparison
 * Compares primitives by value and objects/arrays by reference
 * Note: Uses Object.is for comparison, which treats NaN === NaN as true
 * and +0 !== -0 (though this rarely matters in practice)
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) {
    return true
  }

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }

  const keysA = Object.keys(a) as Array<keyof T>
  const keysB = Object.keys(b) as Array<keyof T>

  if (keysA.length !== keysB.length) {
    return false
  }

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
      return false
    }
  }

  return true
}

/**
 * Strict reference equality comparison
 */
export function strictEqual<T>(a: T, b: T): boolean {
  return Object.is(a, b)
}

/**
 * Internal store interface for managing subscriptions
 */
interface Store<T> {
  getState: () => T
  subscribe: (listener: () => void) => () => void
  setState: (newState: T) => void
  getVersion: () => number
}

/**
 * Creates a simple store with subscription support
 */
function createStore<T>(initialState: T): Store<T> {
  let state = initialState
  let version = 0
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    getVersion: () => version,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setState: (newState: T) => {
      // Only update if the state has actually changed
      if (!Object.is(state, newState)) {
        state = newState
        version++
        // Notify all listeners - they will use their selectors
        // to determine if they need to re-render
        listeners.forEach((listener) => listener())
      }
    },
  }
}

/**
 * Context value type that holds the store reference
 */
interface SelectableContextValue<T> {
  storeRef: React.MutableRefObject<Store<T>>
}

/**
 * Result type from createSelectableContext
 */
export interface SelectableContext<T> {
  /**
   * Provider component that wraps children with the context
   */
  Provider: React.FC<{ value: T; children: React.ReactNode }>

  /**
   * Hook to select a specific part of the context state
   * Only re-renders when the selected value changes
   *
   * @param selector - Function to extract desired value from state
   * @param equalityFn - Optional equality function (defaults to strict equality)
   * @returns The selected value
   */
  useSelector: <R>(selector: Selector<T, R>, equalityFn?: EqualityFn<R>) => R

  /**
   * Hook to get the full context state
   * Use sparingly - prefer useSelector for better performance
   *
   * @returns The full context state
   */
  useStore: () => T

  /**
   * Hook to get a dispatch function for updating state
   *
   * @returns Function to update state with partial updates
   */
  useDispatch: () => (action: Partial<T> | ((prev: T) => T)) => void

  /**
   * Hook to subscribe to state changes without causing re-renders
   * Useful for side effects
   *
   * @param callback - Function called when state changes
   */
  useSubscribe: (callback: (state: T) => void) => void
}

/**
 * Creates a selectable context with optimized re-rendering behavior.
 *
 * Components using useSelector will only re-render when their selected
 * value changes, not when other parts of the context change.
 *
 * @example
 * ```tsx
 * interface AppState {
 *   theme: 'light' | 'dark'
 *   user: { name: string; email: string }
 *   count: number
 * }
 *
 * const { Provider, useSelector, useDispatch } = createSelectableContext<AppState>()
 *
 * // In a component - only re-renders when theme changes
 * function ThemeDisplay() {
 *   const theme = useSelector(state => state.theme)
 *   return <div>Current theme: {theme}</div>
 * }
 *
 * // In another component - only re-renders when user changes
 * function UserDisplay() {
 *   const user = useSelector(state => state.user, shallowEqual)
 *   return <div>User: {user.name}</div>
 * }
 * ```
 *
 * @returns Object containing Provider, useSelector, useStore, useDispatch, and useSubscribe
 */
export function createSelectableContext<T extends object>(): SelectableContext<T> {
  const Context = createContext<SelectableContextValue<T> | null>(null)

  /**
   * Provider component that manages the store and provides it to children
   */
  const Provider: React.FC<{ value: T; children: React.ReactNode }> = ({ value, children }) => {
    const storeRef = useRef<Store<T>>(null as unknown as Store<T>)

    if (storeRef.current === null) {
      storeRef.current = createStore(value)
    }

    useLayoutEffect(() => {
      storeRef.current.setState(value)
    }, [value])

    // Memoize context value - this never changes after initial render
    const contextValue = useMemo(
      () => ({ storeRef }),
      [] // Empty deps - storeRef is stable
    )

    return React.createElement(Context.Provider, { value: contextValue }, children)
  }

  /**
   * Hook to select a specific part of the context state
   * Uses useSyncExternalStore for React 18 concurrent mode compatibility
   */
  function useSelector<R>(selector: Selector<T, R>, equalityFn: EqualityFn<R> = strictEqual): R {
    const context = useContext(Context)

    if (context === null) {
      throw new Error('useSelector must be used within a SelectableContext Provider')
    }

    const { storeRef } = context
    const store = storeRef.current

    // Keep refs for selector and equality function
    const selectorRef = useRef(selector)
    const equalityFnRef = useRef(equalityFn)

    // Cache for the selected value - persists across renders
    const cacheRef = useRef<{ value: R; storeVersion: number } | null>(null)

    selectorRef.current = selector
    equalityFnRef.current = equalityFn

    // This function must return the same reference if the selected value is equal
    const getSnapshot = useCallback((): R => {
      const currentVersion = store.getVersion()
      const state = store.getState()

      // If we have a cached value from the same store version, return it
      if (cacheRef.current !== null && cacheRef.current.storeVersion === currentVersion) {
        return cacheRef.current.value
      }

      // Compute the new selected value
      const newSelected = selectorRef.current(state)

      // If we have a cached value and it's equal to the new value,
      // update the version but return the cached value reference
      // This is crucial for preventing unnecessary re-renders
      if (cacheRef.current !== null && equalityFnRef.current(cacheRef.current.value, newSelected)) {
        cacheRef.current.storeVersion = currentVersion
        return cacheRef.current.value
      }

      // Cache the new value
      cacheRef.current = { value: newSelected, storeVersion: currentVersion }
      return newSelected
    }, [store])

    // Use useSyncExternalStore for concurrent mode compatibility
    // React will only re-render if getSnapshot returns a different value (by reference)
    return useSyncExternalStore(
      store.subscribe,
      getSnapshot,
      getSnapshot // Server snapshot (same as client for this use case)
    )
  }

  /**
   * Hook to get the full context state
   */
  function useStore(): T {
    const context = useContext(Context)

    if (context === null) {
      throw new Error('useStore must be used within a SelectableContext Provider')
    }

    const { storeRef } = context
    const store = storeRef.current

    return useSyncExternalStore(store.subscribe, store.getState, store.getState)
  }

  /**
   * Hook to get a dispatch function for updating state
   */
  function useDispatch(): (action: Partial<T> | ((prev: T) => T)) => void {
    const context = useContext(Context)

    if (context === null) {
      throw new Error('useDispatch must be used within a SelectableContext Provider')
    }

    const { storeRef } = context
    const store = storeRef.current

    return useCallback(
      (action: Partial<T> | ((prev: T) => T)) => {
        const currentState = store.getState()

        if (typeof action === 'function') {
          store.setState(action(currentState))
        } else {
          store.setState({ ...currentState, ...action })
        }
      },
      [store]
    )
  }

  /**
   * Hook to subscribe to state changes without causing re-renders
   */
  function useSubscribe(callback: (state: T) => void): void {
    const context = useContext(Context)

    if (context === null) {
      throw new Error('useSubscribe must be used within a SelectableContext Provider')
    }

    const { storeRef } = context
    const store = storeRef.current
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    // Subscribe to store changes
    useEffect(() => {
      const unsubscribe = store.subscribe(() => {
        callbackRef.current(store.getState())
      })
      return unsubscribe
    }, [store])
  }

  return {
    Provider,
    useSelector,
    useStore,
    useDispatch,
    useSubscribe,
  }
}

/**
 * Creates a selector with memoization based on input selectors
 * Similar to reselect's createSelector
 *
 * @example
 * ```tsx
 * const selectUser = (state: AppState) => state.user
 * const selectUserName = createMemoizedSelector(
 *   selectUser,
 *   (user) => user.name
 * )
 * ```
 */
export function createMemoizedSelector<T, A, R>(
  inputSelector: Selector<T, A>,
  resultFn: (input: A) => R
): Selector<T, R> {
  let lastInput: A | undefined
  let lastResult: R | undefined

  return (state: T): R => {
    const input = inputSelector(state)

    if (lastInput !== undefined && Object.is(lastInput, input)) {
      return lastResult as R
    }

    lastInput = input
    lastResult = resultFn(input)
    return lastResult
  }
}

/**
 * Creates a selector that combines multiple input selectors
 *
 * @example
 * ```tsx
 * const selectCombined = combineSelectors(
 *   (state: AppState) => state.user,
 *   (state: AppState) => state.settings,
 *   (user, settings) => ({ user, settings })
 * )
 * ```
 */
export function combineSelectors<T, A, B, R>(
  selectorA: Selector<T, A>,
  selectorB: Selector<T, B>,
  combiner: (a: A, b: B) => R
): Selector<T, R> {
  let lastA: A | undefined
  let lastB: B | undefined
  let lastResult: R | undefined

  return (state: T): R => {
    const a = selectorA(state)
    const b = selectorB(state)

    if (lastA !== undefined && lastB !== undefined && Object.is(lastA, a) && Object.is(lastB, b)) {
      return lastResult as R
    }

    lastA = a
    lastB = b
    lastResult = combiner(a, b)
    return lastResult
  }
}

export default createSelectableContext
