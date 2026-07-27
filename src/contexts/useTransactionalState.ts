import { useCallback, useRef, useState, type MutableRefObject } from 'react'

export interface StateTransaction<T, R> {
  state: T
  result: R
}

/**
 * Keeps an imperative, authoritative snapshot beside React's published state.
 *
 * Transactions run exactly once outside React's updater queue. This makes them
 * safe for callers that need to perform follow-up work (such as persistence)
 * after React has accepted the next snapshot, without putting side effects in
 * an updater that React may replay.
 */
export function useTransactionalState<T>(initialState: T): {
  value: T
  ref: MutableRefObject<T>
  replace: (nextState: T) => void
  transact: <R>(reducer: (currentState: T) => StateTransaction<T, R>) => R
} {
  const [value, setValue] = useState(initialState)
  const ref = useRef(initialState)

  const replace = useCallback((nextState: T) => {
    ref.current = nextState
    setValue(nextState)
  }, [])

  const transact = useCallback(<R>(reducer: (currentState: T) => StateTransaction<T, R>): R => {
    const transaction = reducer(ref.current)
    ref.current = transaction.state
    setValue(transaction.state)
    return transaction.result
  }, [])

  return { value, ref, replace, transact }
}
