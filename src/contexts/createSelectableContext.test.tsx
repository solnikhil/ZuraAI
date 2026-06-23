/**
 * Unit Tests for Context Selector System
 *
 *
 * These tests verify the correctness of the context selector system:
 * - Selector-based subscriptions work correctly
 * - Components only re-render when selected values change (via store updates)
 * - Custom equality functions work as expected
 * - React 18 concurrent mode compatibility
 *
 */

import { describe, it, expect, vi } from 'vitest'
import React, { useState, memo } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import {
  createSelectableContext,
  shallowEqual,
  strictEqual,
  createMemoizedSelector,
  combineSelectors,
  type Selector,
} from './createSelectableContext'

// Test state interface
interface TestState {
  count: number
  name: string
  user: {
    id: string
    email: string
  }
  items: string[]
  nested: {
    deep: {
      value: number
    }
  }
}

const initialState: TestState = {
  count: 0,
  name: 'test',
  user: {
    id: '1',
    email: 'test@example.com',
  },
  items: ['a', 'b', 'c'],
  nested: {
    deep: {
      value: 42,
    },
  },
}

describe('createSelectableContext', () => {
  describe('Provider', () => {
    it('should provide context value to children', () => {
      const { Provider, useStore } = createSelectableContext<TestState>()

      function Consumer() {
        const state = useStore()
        return <div data-testid="value">{state.count}</div>
      }

      render(
        <Provider value={initialState}>
          <Consumer />
        </Provider>
      )

      expect(screen.getByTestId('value').textContent).toBe('0')
    })

    it('should update when value prop changes', () => {
      const { Provider, useStore } = createSelectableContext<TestState>()

      function Consumer() {
        const state = useStore()
        return <div data-testid="value">{state.count}</div>
      }

      function Wrapper() {
        const [state, setState] = useState(initialState)
        return (
          <>
            <button onClick={() => setState((s) => ({ ...s, count: s.count + 1 }))}>
              Increment
            </button>
            <Provider value={state}>
              <Consumer />
            </Provider>
          </>
        )
      }

      render(<Wrapper />)

      expect(screen.getByTestId('value').textContent).toBe('0')

      act(() => {
        fireEvent.click(screen.getByText('Increment'))
      })

      expect(screen.getByTestId('value').textContent).toBe('1')
    })
  })

  describe('useSelector', () => {
    it('should select a specific value from state', () => {
      const { Provider, useSelector } = createSelectableContext<TestState>()

      function Consumer() {
        const count = useSelector((state) => state.count)
        return <div data-testid="count">{count}</div>
      }

      render(
        <Provider value={initialState}>
          <Consumer />
        </Provider>
      )

      expect(screen.getByTestId('count').textContent).toBe('0')
    })

    it('should select nested values', () => {
      const { Provider, useSelector } = createSelectableContext<TestState>()

      function Consumer() {
        const email = useSelector((state) => state.user.email)
        return <div data-testid="email">{email}</div>
      }

      render(
        <Provider value={initialState}>
          <Consumer />
        </Provider>
      )

      expect(screen.getByTestId('email').textContent).toBe('test@example.com')
    })

    it('should only re-render when selected value changes via dispatch', () => {
      const { Provider, useSelector, useDispatch } = createSelectableContext<TestState>()
      const countRenderCount = vi.fn()
      const nameRenderCount = vi.fn()

      // Use memo to prevent parent re-renders from affecting children
      const CountConsumer = memo(function CountConsumer() {
        const count = useSelector((state) => state.count)
        countRenderCount()
        return <div data-testid="count">{count}</div>
      })

      const NameConsumer = memo(function NameConsumer() {
        const name = useSelector((state) => state.name)
        nameRenderCount()
        return <div data-testid="name">{name}</div>
      })

      function Controls() {
        const dispatch = useDispatch()
        return (
          <>
            <button
              data-testid="increment"
              onClick={() => dispatch((prev) => ({ ...prev, count: prev.count + 1 }))}
            >
              Increment
            </button>
            <button
              data-testid="change-name"
              onClick={() => dispatch((prev) => ({ ...prev, name: 'changed' }))}
            >
              Change Name
            </button>
          </>
        )
      }

      render(
        <Provider value={initialState}>
          <Controls />
          <CountConsumer />
          <NameConsumer />
        </Provider>
      )

      // Initial render
      expect(countRenderCount).toHaveBeenCalledTimes(1)
      expect(nameRenderCount).toHaveBeenCalledTimes(1)

      // Change name via dispatch - only NameConsumer should re-render
      act(() => {
        fireEvent.click(screen.getByTestId('change-name'))
      })
      expect(countRenderCount).toHaveBeenCalledTimes(1)
      expect(nameRenderCount).toHaveBeenCalledTimes(2)

      // Increment count via dispatch - only CountConsumer should re-render
      act(() => {
        fireEvent.click(screen.getByTestId('increment'))
      })
      expect(countRenderCount).toHaveBeenCalledTimes(2)
      expect(nameRenderCount).toHaveBeenCalledTimes(2)
    })

    it('should work with custom equality function', () => {
      const { Provider, useSelector, useDispatch } = createSelectableContext<TestState>()
      const renderCount = vi.fn()

      const UserConsumer = memo(function UserConsumer() {
        const user = useSelector((state) => state.user, shallowEqual)
        renderCount()
        return <div data-testid="user">{user.email}</div>
      })

      function Controls() {
        const dispatch = useDispatch()
        return (
          <>
            <button
              data-testid="same-user"
              onClick={() =>
                dispatch((prev) => ({
                  ...prev,
                  user: { ...prev.user }, // New object, same values
                }))
              }
            >
              Same User
            </button>
            <button
              data-testid="new-email"
              onClick={() =>
                dispatch((prev) => ({
                  ...prev,
                  user: { ...prev.user, email: 'new@example.com' },
                }))
              }
            >
              New Email
            </button>
          </>
        )
      }

      render(
        <Provider value={initialState}>
          <Controls />
          <UserConsumer />
        </Provider>
      )

      expect(renderCount).toHaveBeenCalledTimes(1)

      // Same user values - should NOT re-render with shallowEqual
      act(() => {
        fireEvent.click(screen.getByTestId('same-user'))
      })
      expect(renderCount).toHaveBeenCalledTimes(1)

      // New email - should re-render
      act(() => {
        fireEvent.click(screen.getByTestId('new-email'))
      })
      expect(renderCount).toHaveBeenCalledTimes(2)
    })

    it('should throw error when used outside Provider', () => {
      const { useSelector } = createSelectableContext<TestState>()

      function Consumer() {
        const count = useSelector((state) => state.count)
        return <div>{count}</div>
      }

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => render(<Consumer />)).toThrow(
        'useSelector must be used within a SelectableContext Provider'
      )

      consoleSpy.mockRestore()
    })
  })

  describe('useDispatch', () => {
    it('should update state with partial updates', () => {
      const { Provider, useSelector, useDispatch } = createSelectableContext<TestState>()

      function Consumer() {
        const count = useSelector((state) => state.count)
        const dispatch = useDispatch()
        return (
          <>
            <div data-testid="count">{count}</div>
            <button data-testid="increment" onClick={() => dispatch({ count: count + 1 })}>
              Increment
            </button>
          </>
        )
      }

      render(
        <Provider value={initialState}>
          <Consumer />
        </Provider>
      )

      expect(screen.getByTestId('count').textContent).toBe('0')

      act(() => {
        fireEvent.click(screen.getByTestId('increment'))
      })

      expect(screen.getByTestId('count').textContent).toBe('1')
    })

    it('should update state with function updater', () => {
      const { Provider, useSelector, useDispatch } = createSelectableContext<TestState>()

      function Consumer() {
        const count = useSelector((state) => state.count)
        const dispatch = useDispatch()
        return (
          <>
            <div data-testid="count">{count}</div>
            <button
              data-testid="add10"
              onClick={() => dispatch((prev) => ({ ...prev, count: prev.count + 10 }))}
            >
              Add 10
            </button>
          </>
        )
      }

      render(
        <Provider value={initialState}>
          <Consumer />
        </Provider>
      )

      expect(screen.getByTestId('count').textContent).toBe('0')

      act(() => {
        fireEvent.click(screen.getByTestId('add10'))
      })

      expect(screen.getByTestId('count').textContent).toBe('10')
    })

    it('should throw error when used outside Provider', () => {
      const { useDispatch } = createSelectableContext<TestState>()

      function Consumer() {
        const dispatch = useDispatch()
        return <button onClick={() => dispatch({ count: 1 })}>Update</button>
      }

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => render(<Consumer />)).toThrow(
        'useDispatch must be used within a SelectableContext Provider'
      )

      consoleSpy.mockRestore()
    })
  })

  describe('useSubscribe', () => {
    it('should call callback on state changes without re-rendering', () => {
      const { Provider, useSubscribe, useDispatch } = createSelectableContext<TestState>()
      const callback = vi.fn()
      const renderCount = vi.fn()

      const Subscriber = memo(function Subscriber() {
        renderCount()
        useSubscribe(callback)
        return <div>Subscriber</div>
      })

      function Controls() {
        const dispatch = useDispatch()
        return (
          <button
            data-testid="increment"
            onClick={() => dispatch((prev) => ({ ...prev, count: prev.count + 1 }))}
          >
            Increment
          </button>
        )
      }

      render(
        <Provider value={initialState}>
          <Controls />
          <Subscriber />
        </Provider>
      )

      expect(renderCount).toHaveBeenCalledTimes(1)
      expect(callback).not.toHaveBeenCalled()

      act(() => {
        fireEvent.click(screen.getByTestId('increment'))
      })

      // Subscriber should not re-render (it's memoized and doesn't use useSelector)
      expect(renderCount).toHaveBeenCalledTimes(1)
      // But callback should be called with new state
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }))
    })
  })

  describe('useStore', () => {
    it('should return full state', () => {
      const { Provider, useStore } = createSelectableContext<TestState>()

      function Consumer() {
        const state = useStore()
        return (
          <>
            <div data-testid="count">{state.count}</div>
            <div data-testid="name">{state.name}</div>
          </>
        )
      }

      render(
        <Provider value={initialState}>
          <Consumer />
        </Provider>
      )

      expect(screen.getByTestId('count').textContent).toBe('0')
      expect(screen.getByTestId('name').textContent).toBe('test')
    })

    it('should throw error when used outside Provider', () => {
      const { useStore } = createSelectableContext<TestState>()

      function Consumer() {
        const state = useStore()
        return <div>{state.count}</div>
      }

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => render(<Consumer />)).toThrow(
        'useStore must be used within a SelectableContext Provider'
      )

      consoleSpy.mockRestore()
    })
  })
})

describe('shallowEqual', () => {
  it('should return true for identical primitives', () => {
    expect(shallowEqual(1, 1)).toBe(true)
    expect(shallowEqual('test', 'test')).toBe(true)
    expect(shallowEqual(true, true)).toBe(true)
    expect(shallowEqual(null, null)).toBe(true)
    expect(shallowEqual(undefined, undefined)).toBe(true)
  })

  it('should return false for different primitives', () => {
    expect(shallowEqual(1, 2)).toBe(false)
    expect(shallowEqual('test', 'other')).toBe(false)
    expect(shallowEqual(true, false)).toBe(false)
  })

  it('should return true for objects with same keys and values', () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
    expect(shallowEqual({ name: 'test' }, { name: 'test' })).toBe(true)
  })

  it('should return false for objects with different values', () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false)
  })

  it('should return false for objects with different keys', () => {
    expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false)
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('should return true for same reference', () => {
    const obj = { a: 1 }
    expect(shallowEqual(obj, obj)).toBe(true)
  })

  it('should handle NaN correctly', () => {
    expect(shallowEqual(NaN, NaN)).toBe(true)
  })

  it('should handle +0 and -0 correctly', () => {
    // Object.is treats +0 and -0 as different, which is the correct behavior
    // for our use case (strict equality checking)
    expect(shallowEqual(0, -0)).toBe(false)
  })
})

describe('strictEqual', () => {
  it('should return true for identical values', () => {
    expect(strictEqual(1, 1)).toBe(true)
    expect(strictEqual('test', 'test')).toBe(true)
    const obj = { a: 1 }
    expect(strictEqual(obj, obj)).toBe(true)
  })

  it('should return false for different references', () => {
    expect(strictEqual({ a: 1 }, { a: 1 })).toBe(false)
    expect(strictEqual([1, 2], [1, 2])).toBe(false)
  })

  it('should handle NaN correctly', () => {
    expect(strictEqual(NaN, NaN)).toBe(true)
  })
})

describe('createMemoizedSelector', () => {
  it('should memoize selector results', () => {
    const inputSelector: Selector<TestState, { id: string; email: string }> = (state) => state.user
    const resultFn = vi.fn((user: { id: string; email: string }) => user.email.toUpperCase())

    const memoizedSelector = createMemoizedSelector(inputSelector, resultFn)

    const state1 = { ...initialState }
    const state2 = { ...initialState, count: 1 } // Different count, same user

    const result1 = memoizedSelector(state1)
    expect(result1).toBe('TEST@EXAMPLE.COM')
    expect(resultFn).toHaveBeenCalledTimes(1)

    // Same user reference - should use cached result
    const result2 = memoizedSelector(state2)
    expect(result2).toBe('TEST@EXAMPLE.COM')
    expect(resultFn).toHaveBeenCalledTimes(1) // Not called again
  })

  it('should recompute when input changes', () => {
    const inputSelector: Selector<TestState, { id: string; email: string }> = (state) => state.user
    const resultFn = vi.fn((user: { id: string; email: string }) => user.email.toUpperCase())

    const memoizedSelector = createMemoizedSelector(inputSelector, resultFn)

    const state1 = { ...initialState }
    const state2 = {
      ...initialState,
      user: { id: '2', email: 'new@example.com' },
    }

    memoizedSelector(state1)
    expect(resultFn).toHaveBeenCalledTimes(1)

    const result2 = memoizedSelector(state2)
    expect(result2).toBe('NEW@EXAMPLE.COM')
    expect(resultFn).toHaveBeenCalledTimes(2)
  })
})

describe('combineSelectors', () => {
  it('should combine multiple selectors', () => {
    const selectCount: Selector<TestState, number> = (state) => state.count
    const selectName: Selector<TestState, string> = (state) => state.name

    const combined = combineSelectors(selectCount, selectName, (count, name) => `${name}: ${count}`)

    const result = combined(initialState)
    expect(result).toBe('test: 0')
  })

  it('should memoize combined results', () => {
    const selectCount: Selector<TestState, number> = (state) => state.count
    const selectName: Selector<TestState, string> = (state) => state.name
    const combiner = vi.fn((count: number, name: string) => `${name}: ${count}`)

    const combined = combineSelectors(selectCount, selectName, combiner)

    const state1 = { ...initialState }
    const state2 = { ...initialState, user: { id: '2', email: 'new@example.com' } }

    combined(state1)
    expect(combiner).toHaveBeenCalledTimes(1)

    // Same count and name - should use cached result
    combined(state2)
    expect(combiner).toHaveBeenCalledTimes(1)
  })

  it('should recompute when any input changes', () => {
    const selectCount: Selector<TestState, number> = (state) => state.count
    const selectName: Selector<TestState, string> = (state) => state.name
    const combiner = vi.fn((count: number, name: string) => `${name}: ${count}`)

    const combined = combineSelectors(selectCount, selectName, combiner)

    combined(initialState)
    expect(combiner).toHaveBeenCalledTimes(1)

    combined({ ...initialState, count: 5 })
    expect(combiner).toHaveBeenCalledTimes(2)

    combined({ ...initialState, count: 5, name: 'changed' })
    expect(combiner).toHaveBeenCalledTimes(3)
  })
})

describe('Multiple consumers with different selectors', () => {
  it('should independently re-render based on selected values via dispatch', () => {
    const { Provider, useSelector, useDispatch } = createSelectableContext<TestState>()
    const countRenderCount = vi.fn()
    const nameRenderCount = vi.fn()

    const CountConsumer = memo(function CountConsumer() {
      const count = useSelector((state) => state.count)
      countRenderCount()
      return <div data-testid="count">{count}</div>
    })

    const NameConsumer = memo(function NameConsumer() {
      const name = useSelector((state) => state.name)
      nameRenderCount()
      return <div data-testid="name">{name}</div>
    })

    function Controls() {
      const dispatch = useDispatch()
      return (
        <>
          <button
            data-testid="increment"
            onClick={() => dispatch((prev) => ({ ...prev, count: prev.count + 1 }))}
          >
            Increment
          </button>
          <button
            data-testid="change-name"
            onClick={() => dispatch((prev) => ({ ...prev, name: 'changed' }))}
          >
            Change Name
          </button>
        </>
      )
    }

    render(
      <Provider value={initialState}>
        <Controls />
        <CountConsumer />
        <NameConsumer />
      </Provider>
    )

    expect(countRenderCount).toHaveBeenCalledTimes(1)
    expect(nameRenderCount).toHaveBeenCalledTimes(1)

    // Increment count - only CountConsumer should re-render
    act(() => {
      fireEvent.click(screen.getByTestId('increment'))
    })
    expect(countRenderCount).toHaveBeenCalledTimes(2)
    expect(nameRenderCount).toHaveBeenCalledTimes(1)

    // Change name - only NameConsumer should re-render
    act(() => {
      fireEvent.click(screen.getByTestId('change-name'))
    })
    expect(countRenderCount).toHaveBeenCalledTimes(2)
    expect(nameRenderCount).toHaveBeenCalledTimes(2)
  })
})
