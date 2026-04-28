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
    initializeOverlay,
    cleanupOverlay,
    showOverlay,
    toggleOverlay,
    getOverlayState,
    applyOverlaySettings,
    showOverlayAtPosition,
} from './overlayWindow'

export {
    showPromptPopup,
    hidePromptPopup,
    destroyPromptPopup,
    submitPrompt,
} from './promptPopup'

export {
    createTray,
    destroyTray
} from './tray'

export {
    showSpotlight,
    hideSpotlight,
} from './spotlightOverlay'