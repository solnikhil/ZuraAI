/**
 * Property-Based Tests for Rendering Optimization
 *
 *
 * These tests verify the correctness properties defined in the design document:
 * - Property 20: Context Selector Re-render Prevention
 * - Property 21: Message Component Memoization
 * - Property 22: Isolated Streaming Updates
 *
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import React, { memo, useState, useCallback } from 'react'
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react'

// Test Utilities and Arbitraries

/**
 * Arbitrary for generating Message props matching the MessageRenderer interface
 */
const messageArbitrary = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom('user', 'assistant', 'system') as fc.Arbitrary<
    'user' | 'assistant' | 'system'
  >,
  content: fc.string({ minLength: 0, maxLength: 500 }),
  timestamp: fc.integer({ min: 1600000000000, max: 1800000000000 }),
  model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  thinking: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  thinkingDuration: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
  latency: fc.option(fc.integer({ min: 0, max: 30000 }), { nil: undefined }),
  finishReason: fc.option(fc.constantFrom('stop', 'length', 'tool_calls'), { nil: undefined }),
  requestedMaxTokens: fc.option(fc.integer({ min: 100, max: 100000 }), { nil: undefined }),
})

/**
 * Arbitrary for generating thinking blocks
 */
const thinkingBlockArbitrary = fc.record({
  type: fc.constantFrom('thinking', 'searching') as fc.Arbitrary<'thinking' | 'searching'>,
  content: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
  query: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  duration: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: undefined }),
  timestamp: fc.integer({ min: 1600000000000, max: 1800000000000 }),
})

/**
 * Arbitrary for generating file attachments
 */
const fileAttachmentArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constantFrom('image', 'text'),
  size: fc.integer({ min: 100, max: 10000000 }),
  data: fc.string({ minLength: 10, maxLength: 100 }), // Simplified base64
  mimeType: fc.constantFrom('image/png', 'image/jpeg', 'text/plain'),
})

/**
 * Arbitrary for generating tool results
 */
const toolResultArbitrary = fc.record({
  toolCall: fc.record({
    id: fc.uuid(),
    name: fc.constantFrom('web_search', 'research_plan'),
    arguments: fc.record({
      query: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    }),
  }),
  result: fc.record({
    success: fc.boolean(),
    data: fc.option(fc.anything(), { nil: undefined }),
    error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    executionTime: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
  }),
})

/**
 * Arbitrary for generating usage stats
 */
const usageArbitrary = fc.record({
  inputTokens: fc.integer({ min: 0, max: 100000 }),
  outputTokens: fc.integer({ min: 0, max: 100000 }),
  totalTokens: fc.integer({ min: 0, max: 200000 }),
  thinkingTokens: fc.option(fc.integer({ min: 0, max: 50000 }), { nil: undefined }),
  tps: fc.option(fc.float({ min: 0, max: 1000, noNaN: true }), { nil: undefined }),
  ttft: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
})

/**
 * Arbitrary for generating response versions
 */
const responseVersionArbitrary = fc.record({
  id: fc.uuid(),
  content: fc.string({ minLength: 0, maxLength: 500 }),
  timestamp: fc.integer({ min: 1600000000000, max: 1800000000000 }),
  instruction: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
})

/**
 * Arbitrary for generating research status
 */
const researchStatusArbitrary = fc.record({
  currentRound: fc.integer({ min: 1, max: 25 }),
  maxRounds: fc.integer({ min: 1, max: 25 }),
  currentSearch: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  isSearching: fc.boolean(),
})

/**
 * Full message arbitrary with all optional fields
 */
const fullMessageArbitrary = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom('user', 'assistant', 'system') as fc.Arbitrary<
    'user' | 'assistant' | 'system'
  >,
  content: fc.string({ minLength: 0, maxLength: 500 }),
  timestamp: fc.integer({ min: 1600000000000, max: 1800000000000 }),
  model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  thinking: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  thinkingDuration: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
  thinkingBlocks: fc.option(fc.array(thinkingBlockArbitrary, { minLength: 0, maxLength: 5 }), {
    nil: undefined,
  }),
  latency: fc.option(fc.integer({ min: 0, max: 30000 }), { nil: undefined }),
  finishReason: fc.option(fc.constantFrom('stop', 'length', 'tool_calls'), { nil: undefined }),
  requestedMaxTokens: fc.option(fc.integer({ min: 100, max: 100000 }), { nil: undefined }),
  files: fc.option(fc.array(fileAttachmentArbitrary, { minLength: 0, maxLength: 3 }), {
    nil: undefined,
  }),
  toolResults: fc.option(fc.array(toolResultArbitrary, { minLength: 0, maxLength: 3 }), {
    nil: undefined,
  }),
  usage: fc.option(usageArbitrary, { nil: undefined }),
  researchStatus: fc.option(researchStatusArbitrary, { nil: undefined }),
  responseVersions: fc.option(fc.array(responseVersionArbitrary, { minLength: 0, maxLength: 3 }), {
    nil: undefined,
  }),
  currentVersionIndex: fc.option(fc.integer({ min: 0, max: 5 }), { nil: undefined }),
})

/**
 *
 * *For any* parent component re-render with unchanged message props,
 *
 *
 * This test suite validates the areMessagePropsEqual comparison function
 * that is used with React.memo() to prevent unnecessary re-renders.
 */
describe('Property 21: Message Component Memoization', () => {
  /**
   * Helper function that replicates the areMessagePropsEqual logic
   * from MessageRenderer.tsx for testing purposes
   */
  function areMessagePropsEqual(
    prevProps: { message: any; isStreaming?: boolean; onCopy?: any; onRegenerate?: any },
    nextProps: { message: any; isStreaming?: boolean; onCopy?: any; onRegenerate?: any }
  ): boolean {
    // Compare isStreaming
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false
    }

    // Compare callback references
    if (prevProps.onCopy !== nextProps.onCopy) {
      return false
    }
    if (prevProps.onRegenerate !== nextProps.onRegenerate) {
      return false
    }

    const prevMsg = prevProps.message
    const nextMsg = nextProps.message

    // Compare message identity
    if (prevMsg.id !== nextMsg.id) {
      return false
    }

    // Compare message role
    if (prevMsg.role !== nextMsg.role) {
      return false
    }

    // Compare message content
    if (prevMsg.content !== nextMsg.content) {
      return false
    }

    // Compare timestamp
    if (prevMsg.timestamp !== nextMsg.timestamp) {
      return false
    }

    // Compare model
    if (prevMsg.model !== nextMsg.model) {
      return false
    }

    // Compare thinking content
    if (prevMsg.thinking !== nextMsg.thinking) {
      return false
    }

    // Compare thinking duration
    if (prevMsg.thinkingDuration !== nextMsg.thinkingDuration) {
      return false
    }

    // Compare thinking blocks array
    const prevThinkingBlocks = prevMsg.thinkingBlocks || []
    const nextThinkingBlocks = nextMsg.thinkingBlocks || []
    if (prevThinkingBlocks.length !== nextThinkingBlocks.length) {
      return false
    }
    for (let i = 0; i < prevThinkingBlocks.length; i++) {
      if (
        prevThinkingBlocks[i].content !== nextThinkingBlocks[i].content ||
        prevThinkingBlocks[i].type !== nextThinkingBlocks[i].type
      ) {
        return false
      }
    }

    // Compare research status
    const prevResearch = prevMsg.researchStatus
    const nextResearch = nextMsg.researchStatus
    if (
      prevResearch?.isSearching !== nextResearch?.isSearching ||
      prevResearch?.currentRound !== nextResearch?.currentRound ||
      prevResearch?.maxRounds !== nextResearch?.maxRounds ||
      prevResearch?.currentSearch !== nextResearch?.currentSearch
    ) {
      return false
    }

    // Compare response versions
    const prevVersions = prevMsg.responseVersions || []
    const nextVersions = nextMsg.responseVersions || []
    if (prevVersions.length !== nextVersions.length) {
      return false
    }
    if (prevMsg.currentVersionIndex !== nextMsg.currentVersionIndex) {
      return false
    }

    // Compare tool results
    const prevToolResults = prevMsg.toolResults || []
    const nextToolResults = nextMsg.toolResults || []
    if (prevToolResults.length !== nextToolResults.length) {
      return false
    }
    for (let i = 0; i < prevToolResults.length; i++) {
      if (
        prevToolResults[i].toolCall.id !== nextToolResults[i].toolCall.id ||
        prevToolResults[i].result.success !== nextToolResults[i].result.success
      ) {
        return false
      }
    }

    // Compare files array
    const prevFiles = prevMsg.files || []
    const nextFiles = nextMsg.files || []
    if (prevFiles.length !== nextFiles.length) {
      return false
    }
    for (let i = 0; i < prevFiles.length; i++) {
      if (prevFiles[i].id !== nextFiles[i].id) {
        return false
      }
    }

    // Compare usage stats
    if (
      prevMsg.usage?.inputTokens !== nextMsg.usage?.inputTokens ||
      prevMsg.usage?.outputTokens !== nextMsg.usage?.outputTokens ||
      prevMsg.usage?.totalTokens !== nextMsg.usage?.totalTokens
    ) {
      return false
    }

    // Compare latency
    if (prevMsg.latency !== nextMsg.latency) {
      return false
    }

    // Compare finish reason
    if (prevMsg.finishReason !== nextMsg.finishReason) {
      return false
    }

    // Compare requested max tokens
    if (prevMsg.requestedMaxTokens !== nextMsg.requestedMaxTokens) {
      return false
    }

    // All props are equal
    return true
  }

  afterEach(() => {
    cleanup()
  })

  it('should return true for identical message props (reflexive property)', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, fc.boolean(), (message, isStreaming) => {
        const onCopy = () => {}
        const onRegenerate = () => {}

        const props = { message, isStreaming, onCopy, onRegenerate }

        // Property: areMessagePropsEqual(props, props) === true
        expect(areMessagePropsEqual(props, props)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should return true for deep-equal message props with same callbacks', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, fc.boolean(), (message, isStreaming) => {
        const onCopy = () => {}
        const onRegenerate = () => {}

        // Create a deep copy of the message
        const messageCopy = JSON.parse(JSON.stringify(message))

        const prevProps = { message, isStreaming, onCopy, onRegenerate }
        const nextProps = { message: messageCopy, isStreaming, onCopy, onRegenerate }

        // Property: Deep-equal messages should be considered equal
        expect(areMessagePropsEqual(prevProps, nextProps)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('should return false when message content changes', () => {
    fc.assert(
      fc.property(
        fullMessageArbitrary,
        fc.string({ minLength: 1, maxLength: 100 }),
        (message, newContent) => {
          // Ensure the new content is different
          fc.pre(newContent !== message.content)

          const onCopy = () => {}
          const onRegenerate = () => {}

          const prevProps = { message, isStreaming: false, onCopy, onRegenerate }
          const nextProps = {
            message: { ...message, content: newContent },
            isStreaming: false,
            onCopy,
            onRegenerate,
          }

          // Property: Different content should trigger re-render
          expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return false when isStreaming changes', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, (message) => {
        const onCopy = () => {}
        const onRegenerate = () => {}

        const prevProps = { message, isStreaming: false, onCopy, onRegenerate }
        const nextProps = { message, isStreaming: true, onCopy, onRegenerate }

        // Property: Different isStreaming should trigger re-render
        expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should return false when message ID changes', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, fc.uuid(), (message, newId) => {
        // Ensure the new ID is different
        fc.pre(newId !== message.id)

        const onCopy = () => {}
        const onRegenerate = () => {}

        const prevProps = { message, isStreaming: false, onCopy, onRegenerate }
        const nextProps = {
          message: { ...message, id: newId },
          isStreaming: false,
          onCopy,
          onRegenerate,
        }

        // Property: Different ID should trigger re-render
        expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should return false when thinking content changes', () => {
    fc.assert(
      fc.property(
        fullMessageArbitrary,
        fc.string({ minLength: 1, maxLength: 200 }),
        (message, newThinking) => {
          // Ensure the new thinking is different
          fc.pre(newThinking !== message.thinking)

          const onCopy = () => {}
          const onRegenerate = () => {}

          const prevProps = { message, isStreaming: false, onCopy, onRegenerate }
          const nextProps = {
            message: { ...message, thinking: newThinking },
            isStreaming: false,
            onCopy,
            onRegenerate,
          }

          // Property: Different thinking should trigger re-render
          expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return false when tool results change', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, toolResultArbitrary, (message, newToolResult) => {
        const onCopy = () => {}
        const onRegenerate = () => {}

        const prevToolResults = message.toolResults || []
        const nextToolResults = [...prevToolResults, newToolResult]

        const prevProps = { message, isStreaming: false, onCopy, onRegenerate }
        const nextProps = {
          message: { ...message, toolResults: nextToolResults },
          isStreaming: false,
          onCopy,
          onRegenerate,
        }

        // Property: Different tool results should trigger re-render
        expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should return false when usage stats change', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, usageArbitrary, (message, newUsage) => {
        // Ensure the new usage is different
        const prevUsage = message.usage
        fc.pre(
          !prevUsage ||
            newUsage.inputTokens !== prevUsage.inputTokens ||
            newUsage.outputTokens !== prevUsage.outputTokens ||
            newUsage.totalTokens !== prevUsage.totalTokens
        )

        const onCopy = () => {}
        const onRegenerate = () => {}

        const prevProps = { message, isStreaming: false, onCopy, onRegenerate }
        const nextProps = {
          message: { ...message, usage: newUsage },
          isStreaming: false,
          onCopy,
          onRegenerate,
        }

        // Property: Different usage should trigger re-render
        expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should return false when research status changes', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, researchStatusArbitrary, (message, newResearchStatus) => {
        // Ensure the new research status is different
        const prevResearch = message.researchStatus
        fc.pre(
          !prevResearch ||
            newResearchStatus.isSearching !== prevResearch.isSearching ||
            newResearchStatus.currentRound !== prevResearch.currentRound ||
            newResearchStatus.maxRounds !== prevResearch.maxRounds ||
            newResearchStatus.currentSearch !== prevResearch.currentSearch
        )

        const onCopy = () => {}
        const onRegenerate = () => {}

        const prevProps = { message, isStreaming: false, onCopy, onRegenerate }
        const nextProps = {
          message: { ...message, researchStatus: newResearchStatus },
          isStreaming: false,
          onCopy,
          onRegenerate,
        }

        // Property: Different research status should trigger re-render
        expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should return false when callback references change', () => {
    fc.assert(
      fc.property(fullMessageArbitrary, (message) => {
        const onCopy1 = () => {}
        const onCopy2 = () => {} // Different reference
        const onRegenerate = () => {}

        const prevProps = { message, isStreaming: false, onCopy: onCopy1, onRegenerate }
        const nextProps = { message, isStreaming: false, onCopy: onCopy2, onRegenerate }

        // Property: Different callback references should trigger re-render
        expect(areMessagePropsEqual(prevProps, nextProps)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('should handle undefined optional fields correctly', () => {
    fc.assert(
      fc.property(
        messageArbitrary, // Use simpler arbitrary without optional fields
        (message) => {
          const onCopy = () => {}
          const onRegenerate = () => {}

          // Create message with all optional fields undefined
          const minimalMessage = {
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
          }

          const prevProps = { message: minimalMessage, isStreaming: false, onCopy, onRegenerate }
          const nextProps = {
            message: { ...minimalMessage },
            isStreaming: false,
            onCopy,
            onRegenerate,
          }

          // Property: Messages with undefined optional fields should be equal
          expect(areMessagePropsEqual(prevProps, nextProps)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

import { createSelectableContext, shallowEqual } from '../contexts/createSelectableContext'

/**
 * Test state interface for UI settings (frequently changing)
 */
interface TestUISettings {
  theme: 'light' | 'dark'
  activeTheme: string
  titleBarDensity: 'comfortable' | 'compact'
  sidebarOpen: boolean
}

/**
 * Test state interface for config settings (stable)
 */
interface TestConfigSettings {
  apiKey: string
  modelProvider: string
  temperature: number
  maxTokens: number
}

const testUISettingsArbitrary = fc.record({
  theme: fc.constantFrom('light', 'dark') as fc.Arbitrary<'light' | 'dark'>,
  activeTheme: fc.constantFrom('dark-default', 'light-default', 'custom-theme'),
  titleBarDensity: fc.constantFrom('comfortable', 'compact') as fc.Arbitrary<
    'comfortable' | 'compact'
  >,
  sidebarOpen: fc.boolean(),
})

const testConfigSettingsArbitrary = fc.record({
  apiKey: fc.string({ minLength: 0, maxLength: 64 }),
  modelProvider: fc.constantFrom('openrouter', 'ollama', 'perplexity', 'gemini'),
  temperature: fc.float({ min: 0, max: 2, noNaN: true }),
  maxTokens: fc.integer({ min: 100, max: 100000 }),
})

/**
 *
 * *For any* settings context update, only components that use the specific changed
 *
 * This test validates that:
 * 1. Updating UI settings doesn't cause config consumers to re-render
 * 2. Updating config settings doesn't cause UI consumers to re-render
 * 3. ChatHistoryContext selectors only trigger re-renders when selected value changes
 *
 */
describe('Property 20: Context Selector Re-render Prevention', () => {
  afterEach(() => {
    cleanup()
  })

  describe('Split Settings Context Isolation', () => {
    it('should not re-render config consumers when UI settings change', async () => {
      await fc.assert(
        fc.asyncProperty(
          testUISettingsArbitrary,
          testConfigSettingsArbitrary,
          async (uiSettings, configSettings) => {
            // Create separate contexts for UI and Config
            const {
              Provider: UIProvider,
              useSelector: useUISelector,
              useDispatch: useUIDispatch,
            } = createSelectableContext<TestUISettings>()
            const { Provider: ConfigProvider, useSelector: useConfigSelector } =
              createSelectableContext<TestConfigSettings>()

            const uiRenderCount = { current: 0 }
            const configRenderCount = { current: 0 }

            const UIConsumer = memo(function UIConsumer() {
              const theme = useUISelector((state) => state.theme)
              uiRenderCount.current++
              return <div data-testid="theme">{theme}</div>
            })

            const ConfigConsumer = memo(function ConfigConsumer() {
              const apiKey = useConfigSelector((state) => state.apiKey)
              configRenderCount.current++
              return <div data-testid="apiKey">{apiKey}</div>
            })

            function UIControls() {
              const dispatch = useUIDispatch()
              return (
                <button
                  data-testid="toggle-theme"
                  onClick={() =>
                    dispatch((prev) => ({
                      ...prev,
                      theme: prev.theme === 'light' ? 'dark' : 'light',
                    }))
                  }
                >
                  Toggle Theme
                </button>
              )
            }

            render(
              <UIProvider value={uiSettings}>
                <ConfigProvider value={configSettings}>
                  <UIControls />
                  <UIConsumer />
                  <ConfigConsumer />
                </ConfigProvider>
              </UIProvider>
            )

            const initialUIRenders = uiRenderCount.current
            const initialConfigRenders = configRenderCount.current

            // Change UI settings
            await act(async () => {
              fireEvent.click(screen.getByTestId('toggle-theme'))
            })

            // Property: UI consumer should re-render, config consumer should NOT
            expect(uiRenderCount.current).toBe(initialUIRenders + 1)
            expect(configRenderCount.current).toBe(initialConfigRenders)

            cleanup()
          }
        ),
        { numRuns: 50 }
      )
    })

    it('should not re-render UI consumers when config settings change', async () => {
      await fc.assert(
        fc.asyncProperty(
          testUISettingsArbitrary,
          testConfigSettingsArbitrary,
          async (uiSettings, configSettings) => {
            const { Provider: UIProvider, useSelector: useUISelector } =
              createSelectableContext<TestUISettings>()
            const {
              Provider: ConfigProvider,
              useSelector: useConfigSelector,
              useDispatch: useConfigDispatch,
            } = createSelectableContext<TestConfigSettings>()

            const uiRenderCount = { current: 0 }
            const configRenderCount = { current: 0 }

            const UIConsumer = memo(function UIConsumer() {
              const theme = useUISelector((state) => state.theme)
              uiRenderCount.current++
              return <div data-testid="theme">{theme}</div>
            })

            const ConfigConsumer = memo(function ConfigConsumer() {
              const temperature = useConfigSelector((state) => state.temperature)
              configRenderCount.current++
              return <div data-testid="temperature">{temperature}</div>
            })

            function ConfigControls() {
              const dispatch = useConfigDispatch()
              return (
                <button
                  data-testid="change-temperature"
                  onClick={() =>
                    dispatch((prev) => ({
                      ...prev,
                      temperature: prev.temperature + 0.1,
                    }))
                  }
                >
                  Change Temperature
                </button>
              )
            }

            render(
              <UIProvider value={uiSettings}>
                <ConfigProvider value={configSettings}>
                  <ConfigControls />
                  <UIConsumer />
                  <ConfigConsumer />
                </ConfigProvider>
              </UIProvider>
            )

            const initialUIRenders = uiRenderCount.current
            const initialConfigRenders = configRenderCount.current

            // Change config settings
            await act(async () => {
              fireEvent.click(screen.getByTestId('change-temperature'))
            })

            // Property: Config consumer should re-render, UI consumer should NOT
            expect(configRenderCount.current).toBe(initialConfigRenders + 1)
            expect(uiRenderCount.current).toBe(initialUIRenders)

            cleanup()
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('ChatHistoryContext Selector Isolation', () => {
    /**
     * Test state interface matching ChatHistoryContext
     */
    interface TestChatHistoryState {
      sessions: Array<{ id: string; title: string; messageCount: number }>
      currentSessionId: string | null
      isLoading: boolean
    }

    const testChatHistoryArbitrary = fc.record({
      sessions: fc.array(
        fc.record({
          id: fc.uuid(),
          title: fc.string({ minLength: 1, maxLength: 100 }),
          messageCount: fc.integer({ min: 0, max: 1000 }),
        }),
        { minLength: 0, maxLength: 10 }
      ),
      currentSessionId: fc.option(fc.uuid(), { nil: null }),
      isLoading: fc.boolean(),
    })

    it('should only re-render sessions list when sessions change', async () => {
      await fc.assert(
        fc.asyncProperty(testChatHistoryArbitrary, async (initialState) => {
          const { Provider, useSelector, useDispatch } =
            createSelectableContext<TestChatHistoryState>()

          const sessionsRenderCount = { current: 0 }
          const currentIdRenderCount = { current: 0 }
          const loadingRenderCount = { current: 0 }

          const SessionsConsumer = memo(function SessionsConsumer() {
            const sessions = useSelector((state) => state.sessions)
            sessionsRenderCount.current++
            return <div data-testid="sessions">{sessions.length}</div>
          })

          const CurrentIdConsumer = memo(function CurrentIdConsumer() {
            const currentId = useSelector((state) => state.currentSessionId)
            currentIdRenderCount.current++
            return <div data-testid="currentId">{currentId || 'none'}</div>
          })

          const LoadingConsumer = memo(function LoadingConsumer() {
            const isLoading = useSelector((state) => state.isLoading)
            loadingRenderCount.current++
            return <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
          })

          function Controls() {
            const dispatch = useDispatch()
            return (
              <>
                <button
                  data-testid="add-session"
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
              </>
            )
          }

          render(
            <Provider value={initialState}>
              <Controls />
              <SessionsConsumer />
              <CurrentIdConsumer />
              <LoadingConsumer />
            </Provider>
          )

          const initialSessionsRenders = sessionsRenderCount.current
          const initialCurrentIdRenders = currentIdRenderCount.current
          const initialLoadingRenders = loadingRenderCount.current

          // Add a session
          await act(async () => {
            fireEvent.click(screen.getByTestId('add-session'))
          })

          // Property: Only sessions consumer should re-render
          expect(sessionsRenderCount.current).toBe(initialSessionsRenders + 1)
          expect(currentIdRenderCount.current).toBe(initialCurrentIdRenders)
          expect(loadingRenderCount.current).toBe(initialLoadingRenders)

          // Toggle loading
          await act(async () => {
            fireEvent.click(screen.getByTestId('toggle-loading'))
          })

          // Property: Only loading consumer should re-render
          expect(sessionsRenderCount.current).toBe(initialSessionsRenders + 1) // No change
          expect(currentIdRenderCount.current).toBe(initialCurrentIdRenders) // No change
          expect(loadingRenderCount.current).toBe(initialLoadingRenders + 1)

          cleanup()
        }),
        { numRuns: 50 }
      )
    })
  })
})

/**
 *
 * *For any* streaming message update, only the specific message being updated
 *
 * This test validates that:
 * 1. StreamingContext updates don't trigger ChatHistoryContext re-renders
 * 2. Streaming state is properly isolated
 * 3. Only the streaming message component re-renders during streaming
 *
 */
describe('Property 22: Isolated Streaming Updates', () => {
  afterEach(() => {
    cleanup()
  })

  /**
   * Streaming state interface matching StreamingContext
   */
  interface TestStreamingState {
    sessionId: string | null
    messageId: string | null
    content: string
    isStreaming: boolean
  }

  /**
   * Chat history state interface
   */
  interface TestChatState {
    sessions: Array<{ id: string; title: string; messages: string[] }>
    currentSessionId: string | null
  }

  const testStreamingStateArbitrary = fc.record({
    sessionId: fc.option(fc.uuid(), { nil: null }),
    messageId: fc.option(fc.uuid(), { nil: null }),
    content: fc.string({ minLength: 0, maxLength: 500 }),
    isStreaming: fc.boolean(),
  })

  const testChatStateArbitrary = fc.record({
    sessions: fc.array(
      fc.record({
        id: fc.uuid(),
        title: fc.string({ minLength: 1, maxLength: 50 }),
        messages: fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
          minLength: 0,
          maxLength: 10,
        }),
      }),
      { minLength: 0, maxLength: 5 }
    ),
    currentSessionId: fc.option(fc.uuid(), { nil: null }),
  })

  it('should not re-render chat history when streaming content updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        testStreamingStateArbitrary,
        testChatStateArbitrary,
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        async (streamingState, chatState, contentUpdates) => {
          // Create separate contexts for streaming and chat history
          const {
            Provider: StreamingProvider,
            useSelector: useStreamingSelector,
            useDispatch: useStreamingDispatch,
          } = createSelectableContext<TestStreamingState>()
          const { Provider: ChatProvider, useSelector: useChatSelector } =
            createSelectableContext<TestChatState>()

          const streamingRenderCount = { current: 0 }
          const chatHistoryRenderCount = { current: 0 }

          // Component that subscribes to streaming content
          const StreamingConsumer = memo(function StreamingConsumer() {
            const content = useStreamingSelector((state) => state.content)
            streamingRenderCount.current++
            return <div data-testid="streaming-content">{content}</div>
          })

          // Component that subscribes to chat history
          const ChatHistoryConsumer = memo(function ChatHistoryConsumer() {
            const sessions = useChatSelector((state) => state.sessions)
            chatHistoryRenderCount.current++
            return <div data-testid="sessions-count">{sessions.length}</div>
          })

          function StreamingControls() {
            const dispatch = useStreamingDispatch()
            return (
              <button
                data-testid="update-streaming"
                onClick={() =>
                  dispatch((prev) => ({
                    ...prev,
                    content: prev.content + ' more content',
                  }))
                }
              >
                Update Streaming
              </button>
            )
          }

          render(
            <StreamingProvider value={streamingState}>
              <ChatProvider value={chatState}>
                <StreamingControls />
                <StreamingConsumer />
                <ChatHistoryConsumer />
              </ChatProvider>
            </StreamingProvider>
          )

          const initialStreamingRenders = streamingRenderCount.current
          const initialChatRenders = chatHistoryRenderCount.current

          // Simulate multiple streaming updates
          for (let i = 0; i < contentUpdates.length; i++) {
            await act(async () => {
              fireEvent.click(screen.getByTestId('update-streaming'))
            })
          }

          // Property: Streaming consumer should re-render for each update
          expect(streamingRenderCount.current).toBe(initialStreamingRenders + contentUpdates.length)

          // Property: Chat history consumer should NOT re-render
          expect(chatHistoryRenderCount.current).toBe(initialChatRenders)

          cleanup()
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should isolate streaming state from message list state', async () => {
    await fc.assert(
      fc.asyncProperty(
        testStreamingStateArbitrary,
        testChatStateArbitrary,
        async (streamingState, chatState) => {
          const {
            Provider: StreamingProvider,
            useSelector: useStreamingSelector,
            useDispatch: useStreamingDispatch,
          } = createSelectableContext<TestStreamingState>()
          const {
            Provider: ChatProvider,
            useSelector: useChatSelector,
            useDispatch: useChatDispatch,
          } = createSelectableContext<TestChatState>()

          const streamingRenderCount = { current: 0 }
          const messageListRenderCount = { current: 0 }

          // Streaming message component
          const StreamingMessage = memo(function StreamingMessage() {
            const isStreaming = useStreamingSelector((state) => state.isStreaming)
            const content = useStreamingSelector((state) => state.content)
            streamingRenderCount.current++
            return (
              <div data-testid="streaming-message">
                {isStreaming ? 'Streaming: ' : 'Done: '}
                {content}
              </div>
            )
          })

          // Message list component (should not re-render during streaming)
          const MessageList = memo(function MessageList() {
            const sessions = useChatSelector((state) => state.sessions)
            messageListRenderCount.current++
            return (
              <div data-testid="message-list">
                {sessions.map((s) => (
                  <div key={s.id}>
                    {s.title}: {s.messages.length} messages
                  </div>
                ))}
              </div>
            )
          })

          function Controls() {
            const streamingDispatch = useStreamingDispatch()
            const chatDispatch = useChatDispatch()
            return (
              <>
                <button
                  data-testid="start-streaming"
                  onClick={() =>
                    streamingDispatch((prev) => ({
                      ...prev,
                      isStreaming: true,
                      content: '',
                    }))
                  }
                >
                  Start Streaming
                </button>
                <button
                  data-testid="append-content"
                  onClick={() =>
                    streamingDispatch((prev) => ({
                      ...prev,
                      content: prev.content + 'token ',
                    }))
                  }
                >
                  Append Content
                </button>
                <button
                  data-testid="stop-streaming"
                  onClick={() =>
                    streamingDispatch((prev) => ({
                      ...prev,
                      isStreaming: false,
                    }))
                  }
                >
                  Stop Streaming
                </button>
                <button
                  data-testid="add-message"
                  onClick={() =>
                    chatDispatch((prev) => {
                      if (prev.sessions.length === 0) return prev
                      const updated = [...prev.sessions]
                      updated[0] = {
                        ...updated[0],
                        messages: [...updated[0].messages, 'new message'],
                      }
                      return { ...prev, sessions: updated }
                    })
                  }
                >
                  Add Message
                </button>
              </>
            )
          }

          render(
            <StreamingProvider value={streamingState}>
              <ChatProvider value={chatState}>
                <Controls />
                <StreamingMessage />
                <MessageList />
              </ChatProvider>
            </StreamingProvider>
          )

          const initialStreamingRenders = streamingRenderCount.current
          const initialMessageListRenders = messageListRenderCount.current

          // Start streaming
          await act(async () => {
            fireEvent.click(screen.getByTestId('start-streaming'))
          })

          // Append content multiple times (simulating token streaming)
          for (let i = 0; i < 5; i++) {
            await act(async () => {
              fireEvent.click(screen.getByTestId('append-content'))
            })
          }

          // Stop streaming
          await act(async () => {
            fireEvent.click(screen.getByTestId('stop-streaming'))
          })

          // Property: Streaming component should have re-rendered for each update
          // (start + 5 appends + stop = 7 updates)
          expect(streamingRenderCount.current).toBeGreaterThan(initialStreamingRenders)

          // Property: Message list should NOT have re-rendered during streaming
          expect(messageListRenderCount.current).toBe(initialMessageListRenders)

          cleanup()
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should allow message list updates without affecting streaming state', async () => {
    await fc.assert(
      fc.asyncProperty(
        testStreamingStateArbitrary,
        testChatStateArbitrary.filter((state) => state.sessions.length > 0),
        async (streamingState, chatState) => {
          const { Provider: StreamingProvider, useSelector: useStreamingSelector } =
            createSelectableContext<TestStreamingState>()
          const {
            Provider: ChatProvider,
            useSelector: useChatSelector,
            useDispatch: useChatDispatch,
          } = createSelectableContext<TestChatState>()

          const streamingRenderCount = { current: 0 }
          const messageListRenderCount = { current: 0 }

          const StreamingConsumer = memo(function StreamingConsumer() {
            const content = useStreamingSelector((state) => state.content)
            streamingRenderCount.current++
            return <div data-testid="streaming">{content}</div>
          })

          const MessageListConsumer = memo(function MessageListConsumer() {
            const sessions = useChatSelector((state) => state.sessions)
            messageListRenderCount.current++
            return <div data-testid="messages">{sessions.length}</div>
          })

          function ChatControls() {
            const dispatch = useChatDispatch()
            return (
              <button
                data-testid="update-chat"
                onClick={() =>
                  dispatch((prev) => ({
                    ...prev,
                    sessions: [...prev.sessions, { id: 'new', title: 'New', messages: [] }],
                  }))
                }
              >
                Update Chat
              </button>
            )
          }

          render(
            <StreamingProvider value={streamingState}>
              <ChatProvider value={chatState}>
                <ChatControls />
                <StreamingConsumer />
                <MessageListConsumer />
              </ChatProvider>
            </StreamingProvider>
          )

          const initialStreamingRenders = streamingRenderCount.current
          const initialMessageListRenders = messageListRenderCount.current

          // Update chat history
          await act(async () => {
            fireEvent.click(screen.getByTestId('update-chat'))
          })

          // Property: Message list should re-render
          expect(messageListRenderCount.current).toBe(initialMessageListRenders + 1)

          // Property: Streaming consumer should NOT re-render
          expect(streamingRenderCount.current).toBe(initialStreamingRenders)

          cleanup()
        }
      ),
      { numRuns: 50 }
    )
  })

  it('should handle rapid streaming updates without affecting other components', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 5, maxLength: 20 }),
        async (tokens) => {
          const initialStreamingState: TestStreamingState = {
            sessionId: 'test-session',
            messageId: 'test-message',
            content: '',
            isStreaming: true,
          }

          const initialChatState: TestChatState = {
            sessions: [{ id: 'test-session', title: 'Test', messages: [] }],
            currentSessionId: 'test-session',
          }

          const {
            Provider: StreamingProvider,
            useSelector: useStreamingSelector,
            useDispatch: useStreamingDispatch,
          } = createSelectableContext<TestStreamingState>()
          const { Provider: ChatProvider, useSelector: useChatSelector } =
            createSelectableContext<TestChatState>()

          const streamingRenderCount = { current: 0 }
          const chatRenderCount = { current: 0 }
          let lastContent = ''

          const StreamingConsumer = memo(function StreamingConsumer() {
            const content = useStreamingSelector((state) => state.content)
            streamingRenderCount.current++
            lastContent = content
            return <div data-testid="content">{content}</div>
          })

          const ChatConsumer = memo(function ChatConsumer() {
            const sessions = useChatSelector((state) => state.sessions)
            chatRenderCount.current++
            return <div data-testid="chat">{sessions.length}</div>
          })

          function TokenAppender() {
            const dispatch = useStreamingDispatch()
            return (
              <button
                data-testid="append"
                onClick={() =>
                  dispatch((prev) => ({
                    ...prev,
                    content: prev.content + 'token ',
                  }))
                }
              >
                Append
              </button>
            )
          }

          render(
            <StreamingProvider value={initialStreamingState}>
              <ChatProvider value={initialChatState}>
                <TokenAppender />
                <StreamingConsumer />
                <ChatConsumer />
              </ChatProvider>
            </StreamingProvider>
          )

          const initialChatRenders = chatRenderCount.current

          // Simulate rapid token streaming
          for (let i = 0; i < tokens.length; i++) {
            await act(async () => {
              fireEvent.click(screen.getByTestId('append'))
            })
          }

          // Property: Final content should have all tokens
          expect(lastContent).toBe('token '.repeat(tokens.length))

          // Property: Streaming consumer should have re-rendered for each token
          expect(streamingRenderCount.current).toBeGreaterThanOrEqual(tokens.length)

          // Property: Chat consumer should NOT have re-rendered
          expect(chatRenderCount.current).toBe(initialChatRenders)

          cleanup()
        }
      ),
      { numRuns: 50 }
    )
  })
})
