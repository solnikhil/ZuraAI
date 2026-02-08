// Window management barrel export
export {
    createMainWindow,
    getMainWindow,
    showMainWindow,
    setTitleBarOverlay,
    setNativeBlur,
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
