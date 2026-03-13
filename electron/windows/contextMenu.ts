import { BrowserWindow, Menu, clipboard, shell } from 'electron'
import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

interface BuildContextMenuOptions {
    allowInspectElement: boolean
    onInspectElement: () => void
    openExternal?: (url: string) => void | Promise<void>
    copyText?: (value: string) => void
}

function isSafeExternalUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}

function trimSeparators(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
    const compacted: MenuItemConstructorOptions[] = []

    for (const item of template) {
        const isSeparator = item.type === 'separator'
        if (isSeparator && compacted.length === 0) {
            continue
        }

        const last = compacted[compacted.length - 1]
        if (isSeparator && last?.type === 'separator') {
            continue
        }

        compacted.push(item)
    }

    while (compacted.length > 0 && compacted[compacted.length - 1].type === 'separator') {
        compacted.pop()
    }

    return compacted
}

export function buildMainContextMenuTemplate(
    params: ContextMenuParams,
    options: BuildContextMenuOptions,
): MenuItemConstructorOptions[] {
    const template: MenuItemConstructorOptions[] = []
    const openExternal = options.openExternal ?? ((url: string) => {
        void shell.openExternal(url)
    })
    const copyText = options.copyText ?? ((value: string) => {
        clipboard.writeText(value)
    })

    const selectionText = typeof params.selectionText === 'string' ? params.selectionText.trim() : ''
    const linkUrl = typeof params.linkURL === 'string' ? params.linkURL.trim() : ''
    const hasSelection = selectionText.length > 0
    const hasSafeLink = linkUrl.length > 0 && isSafeExternalUrl(linkUrl)

    if (hasSafeLink) {
        template.push({
            label: 'Open Link in Browser',
            click: () => {
                void openExternal(linkUrl)
            },
        })
        template.push({
            label: 'Copy Link Address',
            click: () => {
                copyText(linkUrl)
            },
        })
        template.push({ type: 'separator' })
    }

    if (params.isEditable) {
        template.push(
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
        )
    } else if (hasSelection) {
        template.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' })
    } else {
        template.push({ role: 'selectAll' })
    }

    if (options.allowInspectElement) {
        template.push(
            { type: 'separator' },
            {
                label: 'Inspect Element',
                click: options.onInspectElement,
            },
        )
    }

    return trimSeparators(template)
}

export function attachMainWindowContextMenu(window: BrowserWindow): void {
    window.webContents.on('context-menu', (_event, params) => {
        const template = buildMainContextMenuTemplate(params, {
            allowInspectElement: true,
            onInspectElement: () => {
                window.webContents.inspectElement(params.x, params.y)
            },
        })

        if (template.length === 0) {
            return
        }

        const menu = Menu.buildFromTemplate(template)
        menu.popup({ window })
    })
}
