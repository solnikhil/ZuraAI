import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuParams } from 'electron'
import { buildMainContextMenuTemplate } from './contextMenu'

function createParams(overrides: Partial<ContextMenuParams> = {}): ContextMenuParams {
    return {
        x: 0,
        y: 0,
        isEditable: false,
        selectionText: '',
        linkURL: '',
        ...overrides,
    } as ContextMenuParams
}

describe('buildMainContextMenuTemplate', () => {
    it('returns edit actions for editable targets', () => {
        const template = buildMainContextMenuTemplate(createParams({ isEditable: true }), {
            isDevMode: false,
            onInspectElement: vi.fn(),
        })

        const roles = template.map(item => item.role).filter(Boolean)
        expect(roles).toContain('undo')
        expect(roles).toContain('redo')
        expect(roles).toContain('cut')
        expect(roles).toContain('copy')
        expect(roles).toContain('paste')
        expect(roles).toContain('selectAll')
    })

    it('returns copy and select all for text selection', () => {
        const template = buildMainContextMenuTemplate(createParams({ selectionText: 'selected text' }), {
            isDevMode: false,
            onInspectElement: vi.fn(),
        })

        const roles = template.map(item => item.role).filter(Boolean)
        expect(roles).toEqual(['copy', 'selectAll'])
    })

    it('adds safe link actions and executes callbacks', () => {
        const openExternal = vi.fn()
        const copyText = vi.fn()
        const template = buildMainContextMenuTemplate(createParams({ linkURL: 'https://example.com' }), {
            isDevMode: false,
            onInspectElement: vi.fn(),
            openExternal,
            copyText,
        })

        expect(template[0].label).toBe('Open Link in Browser')
        expect(template[1].label).toBe('Copy Link Address')

        template[0].click?.(undefined as any, undefined as any, undefined as any)
        template[1].click?.(undefined as any, undefined as any, undefined as any)

        expect(openExternal).toHaveBeenCalledWith('https://example.com')
        expect(copyText).toHaveBeenCalledWith('https://example.com')
    })

    it('does not add unsafe link actions', () => {
        const template = buildMainContextMenuTemplate(createParams({ linkURL: 'javascript:alert(1)' }), {
            isDevMode: false,
            onInspectElement: vi.fn(),
        })

        const labels = template.map(item => item.label).filter(Boolean)
        expect(labels).not.toContain('Open Link in Browser')
        expect(labels).not.toContain('Copy Link Address')
    })

    it('adds inspect element in dev mode', () => {
        const inspect = vi.fn()
        const template = buildMainContextMenuTemplate(createParams(), {
            isDevMode: true,
            onInspectElement: inspect,
        })

        const inspectItem = template.find(item => item.label === 'Inspect Element')
        expect(inspectItem).toBeTruthy()
        inspectItem?.click?.(undefined as any, undefined as any, undefined as any)
        expect(inspect).toHaveBeenCalledTimes(1)
    })
})
