import React, { useState } from 'react'
import { Plus, Search, MessageSquare, Trash2, Settings as SettingsIcon, PanelLeft, LayoutDashboard, ChevronDown, User, LogOut, ChartNoAxesCombined, Cpu, Key, ArrowLeft, Github, Star, Sparkles, FileEdit, X } from 'lucide-react'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'

interface SidebarProps {
    view: 'chat' | 'settings'
    onOpenSettings: () => void
    onCloseSettings: () => void
    activeSettingsSection: string
    onNavigateSettings: (section: string) => void
    hasUnsavedSettings?: boolean
}

export default function Sidebar({ view, onOpenSettings, onCloseSettings, activeSettingsSection, onNavigateSettings, hasUnsavedSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isListExpanded, setIsListExpanded] = useState(true)
    const { sessions, currentSessionId, switchSession, deleteSession, clearCurrentSession } = useChatHistory()
    const { settings, resetSettings, updateSettings } = useSettings()

    // Settings UI State
    const [blurInfo, setBlurInfo] = useState(false)

    const filteredSessions = sessions.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Helper to render Chat List Content
    const renderChatContent = () => (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            opacity: view === 'chat' ? 1 : 0,
            transform: view === 'chat' ? 'translateX(0)' : 'translateX(-20px)',
            transition: 'all 0.3s ease',
            pointerEvents: view === 'chat' ? 'all' : 'none',
            position: view === 'chat' ? 'relative' : 'absolute',
            width: '100%'
        }}>
            {/* Header */}
            <div style={{
                padding: isCollapsed ? '16px 8px' : '16px 12px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                {/* Top Actions Row - Library and Retract Button */}
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
                            color: '#999999',
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
                            e.currentTarget.style.color = '#999999'
                        }}
                    >
                        <PanelLeft size={20} />
                    </button>
                </div>

                {/* New Chat Button */}
                <button
                    onClick={() => clearCurrentSession()}
                    title="New chat"
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: isCollapsed ? '0' : '12px',
                        padding: isCollapsed ? '10px' : '12px',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: '#999999',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        justifyContent: isCollapsed ? 'center' : 'flex-start'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                        e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = '#999999'
                    }}
                >
                    <FileEdit size={20} strokeWidth={2} />
                    {!isCollapsed && <span>New chat</span>}
                </button>

                {/* Search Input - Show when not collapsed */}
                {!isCollapsed && (
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        backgroundColor: 'rgba(255,255,255,0.04)', 
                        borderRadius: '8px', 
                        padding: '8px 12px', 
                        border: '1px solid rgba(255,255,255,0.06)', 
                        marginTop: '4px'
                    }}>
                        <Search size={16} color="#b0b0b0" style={{ marginRight: '10px', flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder="Search chats"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                color: '#fff', 
                                fontSize: '0.9rem', 
                                width: '100%', 
                                outline: 'none' 
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#b0b0b0',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Chat History List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: isCollapsed ? '8px 4px 0' : '0 16px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}>
                {!isCollapsed && filteredSessions.length > 0 && (
                    <div onClick={() => setIsListExpanded(!isListExpanded)} style={{ fontSize: '0.85rem', color: '#b0b0b0', padding: '12px 4px 8px', marginTop: '8px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                        <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: isListExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                        <span>Your chats</span>
                    </div>
                )}

                <div style={{ display: isListExpanded && !isCollapsed ? 'flex' : 'none', flexDirection: 'column', gap: '4px' }}>
                    {filteredSessions.map((session, index) => (
                        <div
                            key={session.id}
                            onClick={() => switchSession(session.id)}
                            className="session-item animate-sidebar-item"
                            title={isCollapsed ? session.title : ''}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 12px',
                                cursor: 'pointer',
                                borderRadius: '10px',
                                fontSize: '0.9rem',
                                color: currentSessionId === session.id ? '#fff' : '#b4b4b4',
                                backgroundColor: currentSessionId === session.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                transition: 'all 0.15s ease',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                animationDelay: `${index * 0.05}s`
                            }}
                        >
                            <MessageSquare size={16} style={{ flexShrink: 0, opacity: 0.6 }} />
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: isCollapsed ? 'none' : 'block', minWidth: 0 }}>{session.title}</span>
                            {!isCollapsed && (
                                <div
                                    className="delete-btn"
                                    onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }}
                                    style={{
                                        opacity: 0,
                                        padding: '6px',
                                        borderRadius: '6px',
                                        visibility: currentSessionId === session.id ? 'visible' : 'hidden',
                                        flexShrink: 0,
                                        transition: 'opacity 0.15s ease'
                                    }}
                                >
                                    <Trash2 size={14} color="#b0b0b0" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer - Settings Button */}
            <div style={{
                marginTop: 'auto',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: isCollapsed ? '12px 0' : '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isCollapsed ? 'center' : 'stretch'
            }}>
                <button 
                    onClick={onOpenSettings} 
                    title="Settings" 
                    style={{ 
                        width: isCollapsed ? '40px' : '100%', 
                        padding: isCollapsed ? '10px' : '12px', 
                        cursor: 'pointer', 
                        borderRadius: '8px', 
                        border: 'none', 
                        background: 'transparent', 
                        color: '#fff', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: isCollapsed ? 'center' : 'flex-start', 
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                >
                    <SettingsIcon size={20} strokeWidth={2} />
                    {!isCollapsed && <span>Settings</span>}
                </button>
            </div>
        </div>
    )

    // Helper to render Settings Content
    const renderSettingsContent = () => (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            opacity: view === 'settings' ? 1 : 0,
            transform: view === 'settings' ? 'translateX(0)' : 'translateX(20px)',
            transition: 'all 0.3s ease',
            pointerEvents: view === 'settings' ? 'all' : 'none',
            backgroundColor: '#1B1913', // Ensure BG covers chat list
            boxSizing: 'border-box'
        }}>


            {/* Content Area - grows to push footer down */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 12px 0', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{
                    padding: '0 4px 16px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    marginBottom: '8px'
                }}>
                    {!isCollapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7 }}>
                            <SettingsIcon size={18} />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Settings</span>
                        </div>
                    )}
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#999999',
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

                {/* GitHub Card - Compact vs Full */}
            {isCollapsed ? (
                <div
                    onClick={() => window.open('https://github.com/solnikhil/ZuraAI', '_blank')}
                    style={{
                        padding: '12px',
                        marginBottom: '16px',
                        background: 'rgba(35, 28, 20, 0.7)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    title="Star on GitHub"
                    onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.background = 'rgba(40, 32, 22, 0.85)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = 'rgba(35, 28, 20, 0.7)';
                    }}
                >
                    <Github size={20} color="#fff" />
                </div>
            ) : (
                <div
                    onClick={() => window.open('https://github.com/solnikhil/ZuraAI', '_blank')}
                    style={{
                        padding: '16px',
                        marginBottom: '16px',
                        background: 'rgba(35, 28, 20, 0.7)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.background = 'rgba(40, 32, 22, 0.85)';
                        const badge = e.currentTarget.querySelector('.github-star-badge') as HTMLElement;
                        if (badge) {
                            badge.style.background = 'rgba(255, 215, 0, 0.15)';
                            badge.style.color = '#FFD700';
                        }
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.background = 'rgba(35, 28, 20, 0.7)';
                        const badge = e.currentTarget.querySelector('.github-star-badge') as HTMLElement;
                        if (badge) {
                            badge.style.background = 'rgba(255,255,255,0.05)';
                            badge.style.color = '#e0e0e0';
                        }
                    }}
                >
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: '12px',
                            background: 'linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#1a1a1a',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}>
                            <Github size={28} strokeWidth={2.5} />
                        </div>

                        <div style={{ textAlign: 'center', width: '100%' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', marginBottom: '6px', letterSpacing: '-0.01em' }}>Zura AI</div>

                            <div className="github-star-badge" style={{
                                fontSize: '0.8rem',
                                color: '#e0e0e0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.05)',
                                padding: '6px 12px',
                                borderRadius: '10px',
                                transition: 'all 0.3s ease',
                                border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                <Star size={12} fill="#FFD700" color="#FFD700" />
                                <span style={{ fontWeight: 500 }}>Star on GitHub</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

                {/* Navigation */}
                <div className="nav-menu" style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    padding: 0
                }}>
                    {[
                        { id: 'usage', label: 'Usage', icon: <ChartNoAxesCombined size={18} /> },
                        { id: 'models', label: 'Models', icon: <Cpu size={18} /> },
                        { id: 'preferences', label: 'API Keys', icon: <Key size={18} /> },
                        { id: 'tools', label: 'Tools', icon: <Sparkles size={18} /> }
                    ].map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => onNavigateSettings(item.id)}
                            className={`nav-item animate-sidebar-item ${activeSettingsSection === item.id ? 'active' : ''}`}
                            style={{
                                padding: '10px 12px',
                                fontSize: '0.9rem',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                animationDelay: `${index * 0.05}s`
                            }}
                            title={isCollapsed ? item.label : ''}
                        >
                            {item.icon}
                            {!isCollapsed && item.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Footer - Back to Chat Button */}
            <div style={{
                marginTop: 'auto',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: isCollapsed ? '12px 0' : '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isCollapsed ? 'center' : 'stretch'
            }}>
                <button
                    onClick={onCloseSettings}
                    style={{
                        width: isCollapsed ? '40px' : '100%',
                        padding: isCollapsed ? '10px' : '12px',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                    title={isCollapsed ? "Back to Chat" : ""}
                >
                    <ArrowLeft size={20} strokeWidth={2} />
                    {!isCollapsed && <span>Back to Chat</span>}
                </button>
            </div>
        </div >
    )

    return (
        <div style={{
            width: isCollapsed ? '72px' : '280px',
            background: '#1B1913',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '24px',
            margin: '16px',
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 32px)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            overflow: 'hidden' // Important for sliding content
        }}>
            {renderChatContent()}
            {renderSettingsContent()}

            <style>{`
                .session-item:hover { background-color: rgba(255,255,255,0.06) !important; color: #fff !important; }
                .session-item:hover .delete-btn { opacity: 1 !important; }
                .delete-btn:hover { background-color: rgba(255,255,255,0.1) !important; }
                .delete-btn:hover svg { color: #ef4444 !important; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
                
                .toggle-switch { width: 32px; height: 18px; background: rgba(255,255,255,0.1); border-radius: 9px; position: relative; cursor: pointer; transition: background 0.2s; }
                .toggle-thumb { width: 14px; height: 14px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
                .toggle-switch.active .toggle-thumb { transform: translateX(14px); }
                .toggle-switch.active { background: #fff; }
                
                .btn-signout { width: 100%; padding: 10px; border: 1px solid #333; background: transparent; border-radius: 12px; color: #e0e0e0; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
                .btn-signout:hover { background: #1a1a1a; color: #fff; border-color: #777777; }
                
                .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 16px; color: #b0b0b0; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 0.9rem; font-weight: 500; transition: all 0.2s; width: 100%; }
                .nav-item:hover { color: #e0e0e0; background: rgba(255,255,255,0.03); }
                .nav-item.active { background: rgba(255,255,255,0.1); color: #fff; }

                 @keyframes blur-in-up {
                    0% { opacity: 0; transform: translateY(10px); filter: blur(5px); }
                    100% { opacity: 1; transform: translateY(0); filter: blur(0); }
                }
                .animate-sidebar-item {
                    animation: blur-in-up 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) backwards;
                }
            `}</style>
        </div>
    )
}
