import React, { useEffect, useMemo, useState } from 'react'
import './TitleBar.css'

const getIsMac = () => {
    if (typeof navigator === 'undefined') return false
    return navigator.platform.toLowerCase().includes('mac')
}

export default function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false)
    const isMac = useMemo(() => getIsMac(), [])

    useEffect(() => {
        if (!window.windowControls) return

        let unsubscribe: (() => void) | undefined

        window.windowControls.isMaximized()
            .then(setIsMaximized)
            .catch(() => undefined)

        unsubscribe = window.windowControls.onWindowState((state) => {
            setIsMaximized(state.isMaximized)
        })

        return () => {
            if (unsubscribe) unsubscribe()
        }
    }, [])

    const handleMinimize = () => {
        window.windowControls?.minimize()
    }

    const handleToggleMaximize = async () => {
        const next = await window.windowControls?.toggleMaximize()
        if (typeof next === 'boolean') {
            setIsMaximized(next)
        }
    }

    const handleClose = () => {
        window.windowControls?.close()
    }

    return (
        <div className={`titlebar ${isMac ? 'titlebar--mac' : 'titlebar--windows'}`}>
            <div className="titlebar__drag-region">
                <div className="titlebar__brand">
                    <span className="titlebar__dot" aria-hidden="true" />
                    <span className="titlebar__title">Zura</span>
                </div>
            </div>
            <div className="titlebar__controls" aria-label="Window controls">
                <button className="titlebar__button" onClick={handleMinimize} aria-label="Minimize">
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                </button>
                <button className="titlebar__button" onClick={handleToggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
                    {isMaximized ? (
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M3.5 4.5h4v4h-4z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                            <path d="M4.5 3.5h4v4" stroke="currentColor" strokeWidth="1.2" fill="none" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 12 12" aria-hidden="true">
                            <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
                        </svg>
                    )}
                </button>
                <button className="titlebar__button titlebar__button--close" onClick={handleClose} aria-label="Close">
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
