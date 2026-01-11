// Window management barrel export
export {
    createMainWindow,
    getMainWindow,
    showMainWindow,
    setTitleBarOverlay,
    type MainWindowOptions
} from './mainWindow'

export {
    createOverlayWindow,
    getOverlayWindow,
    showOverlay,
    hideOverlay,
    setQuitting,
    setCurrentScreenshot,
    getCurrentScreenshot,
    clearScreenshot,
    sendSettingsToOverlay
} from './overlayWindow'

export {
    createTray,
    getTray,
    destroyTray
} from './tray'
