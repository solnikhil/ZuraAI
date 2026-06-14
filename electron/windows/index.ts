// Window management barrel export
export {
    createMainWindow,
    getMainWindow,
    resolveDistPath,
} from './mainWindow'

export {
    showAboutWindow,
} from './aboutWindow'

export {
    showChatDebugWindow,
    destroyChatDebugWindow,
} from './chatDebugWindow'

export {
    initializeOverlay,
    cleanupOverlay,
    showOverlay,
    toggleOverlay,
    getOverlayState,
    applyOverlaySettings,
} from './overlayWindow'

export {
    createTray,
    destroyTray
} from './tray'

export {
    createApplicationMenu,
} from './applicationMenu'

export {
    showSpotlight,
    hideSpotlight,
} from './spotlightOverlay'
