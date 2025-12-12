import React, { useState } from 'react'
import { Plus, Search, MessageSquare, Trash2, Settings as SettingsIcon, PanelLeft, LayoutDashboard, ChevronDown } from 'lucide-react'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'

interface SidebarProps {
    onOpenSettings: () => void
}

export default function Sidebar({ onOpenSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isListExpanded, setIsListExpanded] = useState(true)
    const { sessions, currentSessionId, switchSession, deleteSession, clearCurrentSession } = useChatHistory()
    const { settings } = useSettings()

    const filteredSessions = sessions.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Sessions list
    const sessionList = filteredSessions

    return (
        <div style={{
            width: isCollapsed ? '72px' : '260px',
            background: '#040812',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '24px',
            margin: '16px', // Floating on all sides
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 32px)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
            {/* Header */}
            <div style={{
                padding: isCollapsed ? '16px 8px' : '16px 12px 0', // Reduced bottom padding
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                {/* Top Actions Row */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    padding: isCollapsed ? '0' : '0 4px',
                    marginBottom: isCollapsed ? '8px' : '0'
                }}>
                    {!isCollapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7 }}>
                            <LayoutDashboard size={18} />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Library</span>
                        </div>
                    )}
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#666',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'
                            e.currentTarget.style.color = '#fff'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.color = '#666'
                        }}
                    >
                        <PanelLeft size={20} />
                    </button>
                </div>

                {/* New Chat Button */}
                <button
                    onClick={() => clearCurrentSession()}
                    title="New Chat"
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: isCollapsed ? '0' : '8px',
                        padding: '12px',
                        cursor: 'pointer',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    }}
                >
                    <Plus size={20} />
                    {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>New Chat</span>}
                </button>

                {/* Search */}
                {/* Search */}
                {isCollapsed ? (
                    <button
                        onClick={() => setIsCollapsed(false)}
                        title="Search"
                        style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: '10px',
                            background: 'transparent',
                            border: 'none',
                            color: '#666',
                            cursor: 'pointer',
                            borderRadius: '10px',
                            marginBottom: '10px',
                            transition: 'color 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'
                            e.currentTarget.style.color = '#fff'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.color = '#666'
                        }}
                    >
                        <Search size={20} />
                    </button>
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        transition: 'all 0.2s ease',
                        marginBottom: '10px'
                    }}>
                        <Search size={14} color="#666" style={{ marginRight: '10px', flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                fontSize: '0.85rem',
                                width: '100%',
                                outline: 'none'
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Chat History */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: isCollapsed ? '8px 4px 0' : '0 16px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}>
                {!isCollapsed && filteredSessions.length > 0 && (
                    <div
                        onClick={() => setIsListExpanded(!isListExpanded)}
                        style={{
                            fontSize: '0.85rem',
                            color: '#888',
                            padding: '8px 4px',
                            marginTop: '4px',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ccc'}
                        onMouseLeave={e => e.currentTarget.style.color = '#888'}
                    >
                        <ChevronDown
                            size={14}
                            style={{
                                transition: 'transform 0.2s',
                                transform: isListExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
                            }}
                        />
                        <span>Your chats</span>
                    </div>
                )}

                <div style={{
                    display: isListExpanded && !isCollapsed ? 'flex' : 'none',
                    flexDirection: 'column',
                    gap: '2px'
                }}>
                    {filteredSessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => switchSession(session.id)}
                            className="session-item"
                            title={isCollapsed ? session.title : ''}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 8px', // More compact padding
                                cursor: 'pointer',
                                borderRadius: '8px',
                                fontSize: '0.9rem', // Slightly larger text matching image
                                color: currentSessionId === session.id ? '#fff' : '#b4b4b4',
                                backgroundColor: currentSessionId === session.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                transition: 'all 0.15s ease',
                                position: 'relative',
                                justifyContent: isCollapsed ? 'center' : 'flex-start'
                            }}
                        >
                            {/* Removed Icon */}
                            <span style={{
                                flex: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: isCollapsed ? 'none' : 'block',
                                opacity: isCollapsed ? 0 : 1,
                                transition: 'opacity 0.2s',
                                fontWeight: currentSessionId === session.id ? 500 : 400
                            }}>
                                {session.title}
                            </span>
                            {!isCollapsed && currentSessionId === session.id && (
                                <div
                                    className="delete-btn"
                                    onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }}
                                    style={{
                                        opacity: 0,
                                        transition: 'opacity 0.15s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px',
                                        borderRadius: '6px'
                                    }}
                                >
                                    <Trash2 size={13} color="#888" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: isCollapsed ? '12px 0' : '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isCollapsed ? 'center' : 'stretch'
            }}>
                {/* Model Indicator - Simplified if collapsed */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    gap: '8px',
                    padding: isCollapsed ? '8px' : '8px 10px',
                    marginBottom: '8px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    width: isCollapsed ? '40px' : '100%',
                    height: isCollapsed ? '40px' : 'auto',
                    margin: isCollapsed ? '0 auto 8px' : '0 0 8px'
                }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#888',
                        boxShadow: 'none',
                        flexShrink: 0
                    }} />
                    {!isCollapsed && (
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '2px' }}>
                                {settings.modelProvider === 'ollama' ? 'Ollama' : settings.modelProvider === 'perplexity' ? 'Perplexity' : 'OpenRouter'}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#ccc', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {settings.aiModel.split('/').pop()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Settings Button */}
                <button
                    onClick={onOpenSettings}
                    title="Settings"
                    style={{
                        width: isCollapsed ? '40px' : '100%',
                        height: isCollapsed ? '40px' : 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        gap: '10px',
                        padding: isCollapsed ? '0' : '10px 12px',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'transparent',
                        color: '#aaa',
                        fontSize: '0.88rem',
                        transition: 'all 0.15s ease',
                        margin: isCollapsed ? '0 auto' : '0'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'
                        e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = '#aaa'
                    }}
                >
                    <SettingsIcon size={20} />
                    {!isCollapsed && <span>Settings</span>}
                </button>
            </div>

            <style>{`
                .session-item:hover {
                    background-color: rgba(255,255,255,0.06) !important;
                    color: #fff !important;
                }
                .session-item:hover .delete-btn {
                    opacity: 1 !important;
                }
                .delete-btn:hover {
                    background-color: rgba(255,255,255,0.1) !important;
                }
                /* Custom scrollbar */
                ::-webkit-scrollbar {
                    width: 4px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1);
                    border-radius: 2px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.2);
                }
            `}</style>
        </div>
    )
}

