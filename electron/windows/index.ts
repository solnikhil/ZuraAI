// Window management barrel export
export {
  allowMainWindowToClose,
  createMainWindow,
  getMainWindow,
  resolveDistPath,
  showMainWindow,
  setAppQuitting,
  getAppQuitting,
} from './mainWindow'

export { showAboutWindow } from './aboutWindow'

export { showChatDebugWindow, destroyChatDebugWindow } from './chatDebugWindow'

export { createTray, destroyTray } from './tray'

export { createApplicationMenu } from './applicationMenu'

export { showSpotlight, hideSpotlight } from './spotlightOverlay'

export {
  destroyAgentApprovalOverlay,
  registerAgentApprovalOverlayHandlers,
  unregisterAgentApprovalOverlayHandlers,
} from './agentApprovalOverlay'
