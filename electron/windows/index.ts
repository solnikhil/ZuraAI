// Window management barrel export
export { createMainWindow, getMainWindow, resolveDistPath } from './mainWindow'

export { showAboutWindow } from './aboutWindow'

export { showChatDebugWindow, destroyChatDebugWindow } from './chatDebugWindow'

export { createTray, destroyTray } from './tray'

export { createApplicationMenu } from './applicationMenu'

export { showSpotlight, hideSpotlight } from './spotlightOverlay'

export {
  preloadCommandCenterWindow,
  showCommandCenterWindow,
  hideCommandCenterWindow,
  setCommandCenterWindowLayout,
  toggleCommandCenterWindow,
  destroyCommandCenterWindow,
} from './commandCenterOverlay'

export {
  destroyAgentApprovalOverlay,
  registerAgentApprovalOverlayHandlers,
  unregisterAgentApprovalOverlayHandlers,
} from './agentApprovalOverlay'
