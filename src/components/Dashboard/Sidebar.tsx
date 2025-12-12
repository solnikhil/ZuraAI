import React, { useState } from 'react'
import { Plus, Search, MessageSquare, Trash2, Settings as SettingsIcon, PanelLeft, LayoutDashboard } from 'lucide-react'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'

interface SidebarProps {
    onOpenSettings: () => void
}

export default function Sidebar({ onOpenSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [isCollapsed, setIsCollapsed] = useState(false)
    const { sessions, currentSessionId, switchSession, deleteSession, clearCurrentSession } = useChatHistory()
    const { settings } = useSettings()

    const filteredSessions = sessions.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Group sessions by date
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)

    const todaySessions = filteredSessions.filter(s => new Date(s.updatedAt) >= today)
    const yesterdaySessions = filteredSessions.filter(s => {
        const d = new Date(s.updatedAt)
        return d >= yesterday && d < today
    })
    const olderSessions = filteredSessions.filter(s => new Date(s.updatedAt) < yesterday)

    const renderSessionGroup = (title: string, sessionList: typeof sessions) => {
        if (sessionList.length === 0) return null
        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    fontSize: '0.7rem',
                    color: '#666',
                    padding: '8px 12px 6px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    display: isCollapsed ? 'none' : 'block',
                    whiteSpace: 'nowrap',
                    opacity: isCollapsed ? 0 : 1,
                    transition: 'opacity 0.2s'
                }}>{title}</div>
                {sessionList.map(session => (
                    <div
                        key={session.id}
                        onClick={() => switchSession(session.id)}
                        className="session-item"
                        title={isCollapsed ? session.title : ''}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderRadius: '10px',
                            fontSize: '0.88rem',
                            color: currentSessionId === session.id ? '#fff' : '#b4b4b4',
                            backgroundColor: currentSessionId === session.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                            transition: 'all 0.15s ease',
                            position: 'relative',
                            justifyContent: isCollapsed ? 'center' : 'flex-start'
                        }}
                    >
                        <MessageSquare size={18} color={currentSessionId === session.id ? '#fff' : '#666'} style={{ flexShrink: 0 }} />
                        <span style={{
                            flex: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: isCollapsed ? 'none' : 'block',
                            opacity: isCollapsed ? 0 : 1,
                            transition: 'opacity 0.2s'
                        }}>
                            {session.title}
                        </span>
                        {!isCollapsed && (
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
        )
    }

    return (
        <div style={{
            width: isCollapsed ? '56px' : '200px',
            background: '#121212',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative'
        }}>
            {/* Header */}
            <div style={{
                padding: isCollapsed ? '16px 8px' : '16px 12px 8px',
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
                {!isCollapsed && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        transition: 'all 0.2s ease'
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
                padding: isCollapsed ? '8px 4px 0' : '8px 8px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
            }}>
                {renderSessionGroup('Today', todaySessions)}
                {renderSessionGroup('Yesterday', yesterdaySessions)}
                {renderSessionGroup('Previous', olderSessions)}
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

