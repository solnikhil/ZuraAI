import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'

import { showAboutWindow } from './aboutWindow'
import { showMainWindow } from './mainWindow'
import { showMainWindowAndNavigateSettings } from './navigation'

const HELP_URL = 'https://github.com/solnikhil/ZuraAI'

function openHelp(): void {
  void shell.openExternal(HELP_URL)
}

function createMacApplicationMenu(): Menu {
  const appName = app.getName()
  const viewSubmenu: MenuItemConstructorOptions[] = [
    ...(app.isPackaged
      ? []
      : ([
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
        ] satisfies MenuItemConstructorOptions[])),
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ]
  const template: MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { label: `About ${appName}`, click: () => showAboutWindow() },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'Command+,',
          click: () => showMainWindowAndNavigateSettings('providers'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'Show ZuraAI', accelerator: 'Command+0', click: () => showMainWindow() },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: viewSubmenu,
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      submenu: [{ label: 'ZuraAI Help', click: openHelp }],
    },
  ]

  return Menu.buildFromTemplate(template)
}

export function createApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    return
  }

  Menu.setApplicationMenu(createMacApplicationMenu())
}
