import React, { useState } from 'react'
import { Plus, Search, MessageSquare, Trash2, Settings as SettingsIcon, ChevronDown, Sparkles } from 'lucide-react'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'

interface SidebarProps {
    onOpenSettings: () => void
}

export default function Sidebar({ onOpenSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [isCollapsed, setIsCollapsed] = useState(false)
    const { sessions, currentSessionId, switchSession, createSession, deleteSession, clearAllSessions } = useChatHistory()
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
                    letterSpacing: '0.5px'
                }}>{title}</div>
                {sessionList.map(session => (
                    <div
                        key={session.id}
                        onClick={() => switchSession(session.id)}
                        className="session-item"
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
                            position: 'relative'
                        }}
                    >
                        <MessageSquare size={15} color={currentSessionId === session.id ? '#fff' : '#666'} style={{ flexShrink: 0 }} />
                        <span style={{
                            flex: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {session.title}
                        </span>
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
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div style={{
            width: '280px',
            background: 'linear-gradient(180deg, #0a0a0a 0%, #111 100%)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
            {/* Header */}
            <div style={{ padding: '16px 12px 8px' }}>
                {/* New Chat Button */}
                <button
                    onClick={() => createSession()}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                        color: '#fff',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        marginBottom: '12px'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    }}
                >
                    <Plus size={18} />
                    <span>New Chat</span>
                </button>

                {/* Search */}
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
                        placeholder="Search conversations..."
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
            </div>

            {/* Chat History */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
                {filteredSessions.length === 0 && !searchQuery && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px 20px',
                        color: '#555',
                        textAlign: 'center'
                    }}>
                        <Sparkles size={32} color="#333" style={{ marginBottom: '12px' }} />
                        <span style={{ fontSize: '0.85rem' }}>No conversations yet</span>
                        <span style={{ fontSize: '0.75rem', color: '#444', marginTop: '4px' }}>Start a new chat above</span>
                    </div>
                )}

                {filteredSessions.length === 0 && searchQuery && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#555', fontSize: '0.85rem' }}>
                        No results for "{searchQuery}"
                    </div>
                )}

                {renderSessionGroup('Today', todaySessions)}
                {renderSessionGroup('Yesterday', yesterdaySessions)}
                {renderSessionGroup('Previous', olderSessions)}
            </div>

            {/* Footer */}
            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: '12px'
            }}>
                {/* Model Indicator */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    marginBottom: '8px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: settings.modelProvider === 'ollama' ? '#22c55e' : '#f97316',
                        boxShadow: settings.modelProvider === 'ollama' ? '0 0 8px #22c55e' : '0 0 8px #f97316'
                    }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '2px' }}>
                            {settings.modelProvider === 'ollama' ? 'Ollama' : settings.modelProvider === 'perplexity' ? 'Perplexity' : 'OpenRouter'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#ccc', fontWeight: 500 }}>
                            {settings.aiModel.split('/').pop()}
                        </div>
                    </div>
                </div>

                {/* Settings Button */}
                <button
                    onClick={onOpenSettings}
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'transparent',
                        color: '#aaa',
                        fontSize: '0.88rem',
                        transition: 'all 0.15s ease',
                        textAlign: 'left'
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
                    <SettingsIcon size={18} />
                    <span>Settings</span>
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
                    width: 6px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1);
                    border-radius: 3px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.2);
                }
            `}</style>
        </div>
    )
}
