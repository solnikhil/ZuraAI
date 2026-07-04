import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from './ui/menubar'
import type { AppMenuCommand } from '../electron/types'

type EditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'select-all'

interface MenuItemDefinition {
  label: string
  shortcut?: string
  appCommand?: AppMenuCommand
  editCommand?: EditCommand
  devOnly?: boolean
  separatorBefore?: boolean
}

interface MenuDefinition {
  label: string
  items: MenuItemDefinition[]
}

const MENU_DEFINITIONS: MenuDefinition[] = [
  {
    label: 'File',
    items: [
      { label: 'New Chat', shortcut: 'Ctrl+N', appCommand: 'new-chat' },
      { label: 'Settings', shortcut: 'Ctrl+,', appCommand: 'open-settings' },
      { label: 'About', appCommand: 'open-about' },
      {
        label: 'Close Window',
        shortcut: 'Alt+F4',
        appCommand: 'close-window',
        separatorBefore: true,
      },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', editCommand: 'undo' },
      { label: 'Redo', shortcut: 'Ctrl+Y', editCommand: 'redo' },
      { label: 'Cut', shortcut: 'Ctrl+X', editCommand: 'cut', separatorBefore: true },
      { label: 'Copy', shortcut: 'Ctrl+C', editCommand: 'copy' },
      { label: 'Paste', shortcut: 'Ctrl+V', editCommand: 'paste' },
      { label: 'Select All', shortcut: 'Ctrl+A', editCommand: 'select-all', separatorBefore: true },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Reload', shortcut: 'Ctrl+R', appCommand: 'reload' },
      {
        label: 'Toggle DevTools',
        shortcut: 'Ctrl+Shift+I',
        appCommand: 'toggle-devtools',
        devOnly: true,
      },
      { label: 'Reset Zoom', shortcut: 'Ctrl+0', appCommand: 'reset-zoom', separatorBefore: true },
      { label: 'Zoom In', shortcut: 'Ctrl++', appCommand: 'zoom-in' },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', appCommand: 'zoom-out' },
      {
        label: 'Toggle Full Screen',
        shortcut: 'F11',
        appCommand: 'toggle-fullscreen',
        separatorBefore: true,
      },
    ],
  },
  {
    label: 'Window',
    items: [
      { label: 'Minimize', appCommand: 'minimize' },
      { label: 'Maximize/Restore', appCommand: 'toggle-maximize' },
      { label: 'Close', appCommand: 'close-window', separatorBefore: true },
    ],
  },
  {
    label: 'Help',
    items: [{ label: 'ZuraAI Help', appCommand: 'open-help' }],
  },
]

function groupMenuItems(items: MenuItemDefinition[]): MenuItemDefinition[][] {
  return items.reduce<MenuItemDefinition[][]>((groups, item) => {
    if (item.separatorBefore || groups.length === 0) {
      groups.push([])
    }

    groups[groups.length - 1].push(item)
    return groups
  }, [])
}

function isTextInput(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

function insertTextAtSelection(text: string): boolean {
  const activeElement = document.activeElement

  if (isTextInput(activeElement)) {
    const start = activeElement.selectionStart ?? activeElement.value.length
    const end = activeElement.selectionEnd ?? start
    activeElement.setRangeText(text, start, end, 'end')
    activeElement.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }

  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
    activeElement.focus()
    return document.execCommand('insertText', false, text)
  }

  return false
}

export async function executeTitleBarEditCommand(command: EditCommand): Promise<boolean> {
  if (command === 'select-all') {
    return document.execCommand('selectAll')
  }

  if (command === 'paste') {
    const clipboardText =
      (await navigator.clipboard?.readText().catch(() => null)) ??
      (await window.shell?.readClipboardText().catch(() => '')) ??
      ''

    if (clipboardText && insertTextAtSelection(clipboardText)) {
      return true
    }

    return document.execCommand('paste')
  }

  return document.execCommand(command)
}

export function TitleBarAppMenu() {
  const isDev = import.meta.env.DEV

  const handleSelect = (item: MenuItemDefinition) => {
    if (item.appCommand) {
      void window.appMenu?.command(item.appCommand).catch((error) => {
        console.warn('[TitleBarAppMenu] Failed to execute app menu command', item.appCommand, error)
      })
      return
    }

    if (item.editCommand) {
      void executeTitleBarEditCommand(item.editCommand).catch((error) => {
        console.warn('[TitleBarAppMenu] Failed to execute edit command', item.editCommand, error)
      })
    }
  }

  return (
    <Menubar className="app-titlebar__menubar no-drag" aria-label="Application menu">
      {MENU_DEFINITIONS.map((menu) => (
        <MenubarMenu key={menu.label}>
          <MenubarTrigger className="app-titlebar__menu-trigger">{menu.label}</MenubarTrigger>
          <MenubarContent align="start" sideOffset={6} className="app-titlebar__menu-content">
            {groupMenuItems(menu.items.filter((item) => !item.devOnly || isDev)).map(
              (group, groupIndex) => (
                <MenubarGroup key={`${menu.label}-${groupIndex}`}>
                  {groupIndex > 0 && <MenubarSeparator />}
                  {group.map((item) => (
                    <MenubarItem
                      key={item.label}
                      className="app-titlebar__menu-item"
                      onSelect={() => handleSelect(item)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <MenubarShortcut className="app-titlebar__menu-shortcut">
                          {item.shortcut}
                        </MenubarShortcut>
                      )}
                    </MenubarItem>
                  ))}
                </MenubarGroup>
              )
            )}
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  )
}

export default TitleBarAppMenu
