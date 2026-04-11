// Window management barrel export
export {
    createMainWindow,
    getMainWindow,
    resolveDistPath,
} from './mainWindow'

export {
    createAboutWindow,
    showAboutWindow,
} from './aboutWindow'

export {
    initializeOverlay,
    cleanupOverlay,
    showOverlay,
    toggleOverlay,
    getOverlayState,
    applyOverlaySettings,
    showOverlayAtPosition,
    getOverlayWindow,
} from './overlayWindow'

export {
    showPromptPopup,
    hidePromptPopup,
    destroyPromptPopup,
    submitPrompt,
    getPromptPopupWindow,
} from './promptPopup'

export {
    createTray,
    destroyTray
} from './tray'
