import React, { useState } from 'react'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'
import Settings from '../Settings'

export default function DashboardLayout() {
    const [showSettings, setShowSettings] = useState(false)

    return (
        <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <Sidebar onOpenSettings={() => setShowSettings(true)} />

            <div style={{ flex: 1, position: 'relative' }}>
                <ChatArea />

                {/* Settings Overlay Mechanism for Dashboard */}
                {showSettings && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        zIndex: 50,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setShowSettings(false)
                        }}
                    >
                        {/* We wrap Settings component to fit nicely in a modal */}
                        <div style={{ width: '900px', height: '85vh', backgroundColor: '#1a1a1a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #333' }}>
                            <div style={{ padding: '10px', textAlign: 'right' }}>
                                <button
                                    onClick={() => setShowSettings(false)}
                                    style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
                                >×</button>
                            </div>
                            {/* Reuse existing Settings component but maybe need to tweak it to not look fullscreen? 
                                 It was designed as page. Let's see. 
                                 Actually existing Settings has a sidebar itself. 
                                 Might double sidebar. But let's ship this for now.
                             */}
                            <div style={{ height: 'calc(100% - 40px)', overflowY: 'auto' }}>
                                <Settings />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
