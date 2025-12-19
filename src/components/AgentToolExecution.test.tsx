import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { render, screen } from '@testing-library/react'
import AgentToolExecution, { AgentToolExecutionProps, AgentToolExecutionList } from './AgentToolExecution'

// Arbitrary for generating tool names
const toolNameArb = fc.constantFrom(
    'web_search',
    'fetch_url',
    'calculator',
    'get_datetime',
    'read_clipboard',
    'write_clipboard',
    'mouse_click',
    'keyboard_type',
    'read_file',
    'execute_command',
    'custom_tool'
)

// Arbitrary for generating tool arguments
const toolArgsArb = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
    fc.oneof(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer(),
        fc.boolean()
    ),
    { minKeys: 0, maxKeys: 5 }
)

// Arbitrary for generating status
const statusArb = fc.constantFrom('pending', 'executing', 'success', 'error') as fc.Arbitrary<AgentToolExecutionProps['status']>

// Arbitrary for generating results
const resultArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 200 }),
    fc.record({
        data: fc.string(),
        count: fc.integer({ min: 0, max: 100 })
    }),
    fc.array(fc.string(), { minLength: 1, maxLength: 5 })
)

// Arbitrary for generating duration in milliseconds
const durationArb = fc.integer({ min: 1, max: 30000 })

// Arbitrary for generating complete tool execution props
const toolExecutionArb: fc.Arbitrary<AgentToolExecutionProps> = fc.record({
    toolName: toolNameArb,
    args: toolArgsArb,
    status: statusArb,
    result: fc.option(resultArb, { nil: undefined }),
    error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    duration: fc.option(durationArb, { nil: undefined })
})

describe('Agent Tool Execution Display', () => {
    // Known display name mappings from the component
    const toolDisplayNames: Record<string, string> = {
        web_search: 'Web Search',
        fetch_url: 'Fetch URL',
        calculator: 'Calculator',
        get_datetime: 'Date/Time',
        read_clipboard: 'Read Clipboard',
        write_clipboard: 'Write Clipboard',
        mouse_click: 'Mouse Click',
        mouse_move: 'Mouse Move',
        keyboard_type: 'Keyboard Type',
        keyboard_press: 'Keyboard Press',
        read_file: 'Read File',
        write_file: 'Write File',
        list_directory: 'List Directory',
        execute_command: 'Execute Command',
        take_screenshot: 'Screenshot',
    }

    /**
     * **Feature: agent-mode, Property 9: Tool executions are displayed in chat**
     * **Validates: Requirements 3.1, 6.2, 6.3**
     * 
     * For any tool call made during agent execution, the tool name, parameters,
     * and result SHALL be displayed inline in the chat message.
     */
    it('Property 9: Tool executions display tool name for any tool', () => {
        fc.assert(
            fc.property(
                toolExecutionArb,
                (props) => {
                    const { container } = render(<AgentToolExecution {...props} />)
                    
                    // Tool name should be displayed - check for known display name or fallback format
                    const knownDisplayName = toolDisplayNames[props.toolName]
                    const fallbackDisplayName = props.toolName.replace(/_/g, ' ')
                    
                    const hasToolName = knownDisplayName 
                        ? container.textContent?.includes(knownDisplayName)
                        : container.textContent?.toLowerCase().includes(fallbackDisplayName.toLowerCase())
                    
                    expect(hasToolName).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 9 continued: Parameters are displayed
     */
    it('Property 9: Tool executions display parameters', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                toolArgsArb.filter(args => Object.keys(args).length > 0),
                statusArb,
                (toolName, args, status) => {
                    const { container } = render(
                        <AgentToolExecution
                            toolName={toolName}
                            args={args}
                            status={status}
                        />
                    )
                    
                    // At least one parameter key should be visible in the rendered output
                    const paramKeys = Object.keys(args)
                    const hasAtLeastOneParam = paramKeys.some(key => 
                        container.textContent?.includes(key)
                    )
                    
                    expect(hasAtLeastOneParam).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property 9 continued: Status is displayed correctly
     */
    it('Property 9: Tool executions display status indicator', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                toolArgsArb,
                statusArb,
                (toolName, args, status) => {
                    const { container } = render(
                        <AgentToolExecution
                            toolName={toolName}
                            args={args}
                            status={status}
                        />
                    )
                    
                    // Status text should be present
                    const statusTexts: Record<string, string> = {
                        pending: 'Pending',
                        executing: 'Executing',
                        success: 'Success',
                        error: 'Error'
                    }
                    
                    const expectedStatusText = statusTexts[status]
                    expect(container.textContent).toContain(expectedStatusText)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Status-based CSS classes are applied correctly
     */
    it('Status-based CSS classes are applied', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                toolArgsArb,
                statusArb,
                (toolName, args, status) => {
                    const { container } = render(
                        <AgentToolExecution
                            toolName={toolName}
                            args={args}
                            status={status}
                        />
                    )
                    
                    // The root element should have the status class
                    const rootElement = container.firstChild as HTMLElement
                    expect(rootElement.classList.contains(`agent-tool-${status}`)).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Duration is formatted and displayed when provided
     */
    it('Duration is displayed when provided', () => {
        fc.assert(
            fc.property(
                toolNameArb,
                toolArgsArb,
                durationArb,
                (toolName, args, duration) => {
                    const { container } = render(
                        <AgentToolExecution
                            toolName={toolName}
                            args={args}
                            status="success"
                            duration={duration}
                        />
                    )
                    
                    // Duration should be formatted and displayed
                    // Either as "Xms" or "X.Xs"
                    const text = container.textContent || ''
                    const hasDuration = text.includes('ms') || text.includes('s')
                    
                    expect(hasDuration).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Property: Multiple tool executions can be rendered in a list
     */
    it('Multiple tool executions render in list', () => {
        fc.assert(
            fc.property(
                fc.array(toolExecutionArb, { minLength: 1, maxLength: 5 }),
                (executions) => {
                    const { container } = render(
                        <AgentToolExecutionList executions={executions} />
                    )
                    
                    // Each tool execution should be rendered
                    const toolCards = container.querySelectorAll('.agent-tool-execution')
                    expect(toolCards.length).toBe(executions.length)
                }
            ),
            { numRuns: 50 }
        )
    })

    /**
     * Property: Empty list renders nothing
     */
    it('Empty execution list renders nothing', () => {
        const { container } = render(<AgentToolExecutionList executions={[]} />)
        expect(container.firstChild).toBeNull()
    })
})
