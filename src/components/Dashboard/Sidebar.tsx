import React, { useState } from 'react'
import {
    Plus, Search, MessageSquare, Trash2, SettingsIcon,
    LayoutDashboard, ChevronDown, User, LogOut, ChartNoAxesCombined, Cpu,
    Key, ArrowLeft, Github, Star, Sparkles, FileEdit, X, Box, Brain
} from '../icons'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useAppShell } from '../../contexts/AppShellContext'


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
    const { sidebarCollapsed: isCollapsed, sidebarHidden } = useAppShell()
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
            transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
            pointerEvents: view === 'chat' ? 'all' : 'none',
            position: view === 'chat' ? 'relative' : 'absolute',
            width: '100%'
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 8px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                borderBottom: '1px solid var(--theme-border)',
                minWidth: 0,
                overflow: 'hidden'
            }}>

                {/* Quick Actions - Search & New Chat (stacked, grey icons) */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    padding: '0'
                }}>
                    {/* New Chat Button */}
                    <button
                        onClick={() => clearCurrentSession()}
                        className="quick-action-btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 8px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            color: '#ffffff',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            width: '100%',
                            justifyContent: 'flex-start',
                            minWidth: 0,
                            overflow: 'hidden'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--theme-surface-hover)'
                            e.currentTarget.style.color = '#ffffff'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = '#ffffff'
                        }}
                        title={isCollapsed ? 'New Chat' : ''}
                    >
                        <div style={{
                            width: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <FileEdit size={16} strokeWidth={2} />
                        </div>
                        {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>New Chat</span>}
                    </button>

                    {/* Search Button */}
                    <button
                        onClick={() => {
                            const searchInput = document.querySelector('.sidebar-search-input') as HTMLInputElement
                            searchInput?.focus()
                        }}
                        className="quick-action-btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 8px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            color: '#ffffff',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            width: '100%',
                            justifyContent: 'flex-start',
                            minWidth: 0,
                            overflow: 'hidden'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--theme-surface-hover)'
                            e.currentTarget.style.color = '#ffffff'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = '#ffffff'
                        }}
                        title={isCollapsed ? 'Search chats' : ''}
                    >
                        <div style={{
                            width: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <Search size={16} strokeWidth={2} />
                        </div>
                        {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Search chats</span>}
                    </button>
                </div>

                {/* Hidden search input for focus trigger */}
                <input
                    type="text"
                    className="sidebar-search-input"
                    placeholder="Search chats..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        opacity: 0,
                        position: 'absolute',
                        pointerEvents: searchQuery ? 'all' : 'none',
                        background: searchQuery ? 'rgba(255,255,255,0.04)' : 'transparent',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.9rem',
                        outline: 'none',
                        width: isCollapsed ? 'calc(100% - 32px)' : 'calc(100% - 32px)',
                        top: searchQuery ? (isCollapsed ? '90px' : '125px') : '0',
                        left: isCollapsed ? '14px' : '16px',
                        zIndex: 10
                    }}
                />
            </div>

            {/* Chat History List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '4px 8px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '1px',
                minWidth: 0
            }}>
                {!isCollapsed && filteredSessions.length > 0 && (
                    <div
                        onClick={() => setIsListExpanded(!isListExpanded)}
                        onMouseEnter={e => {
                            const chevron = e.currentTarget.querySelector('.chevron-icon') as HTMLElement
                            if (chevron) chevron.style.opacity = '1'
                        }}
                        onMouseLeave={e => {
                            const chevron = e.currentTarget.querySelector('.chevron-icon') as HTMLElement
                            if (chevron) chevron.style.opacity = '0'
                        }}
                        style={{
                            fontSize: '0.75rem',
                            color: 'var(--theme-text-muted)',
                            padding: '6px 0 4px 9px',
                            marginBottom: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            fontWeight: 500,
                            letterSpacing: '0.5px'
                        }}
                    >
                        <span>Your Chats</span>
                        <ChevronDown
                            className="chevron-icon"
                            size={12}
                            style={{
                                transition: 'transform 0.2s, opacity 0.2s',
                                transform: isListExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                opacity: 0,
                                marginLeft: 'auto'
                            }}
                        />
                    </div>
                )}

                <div style={{
                    display: isListExpanded && !isCollapsed ? 'flex' : 'none',
                    flexDirection: 'column',
                    gap: '1px',
                    minWidth: 0
                }}>
                    {filteredSessions.map((session, index) => (
                        <div
                            key={session.id}
                            onClick={() => switchSession(session.id)}
                            className="session-item animate-sidebar-item"
                            title={isCollapsed ? session.title : ''}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 0 4px 6px',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: '#ffffff',
                                backgroundColor: currentSessionId === session.id ? 'var(--theme-surface-active)' : 'transparent',
                                transition: 'all 0.15s ease',
                                justifyContent: 'flex-start',
                                animationDelay: `${index * 0.05}s`,
                                minWidth: 0,
                                overflow: 'hidden'
                            }}
                        >
                            <span style={{
                                flex: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: isCollapsed ? 'none' : 'block',
                                minWidth: 0
                            }}>{session.title}</span>
                            {!isCollapsed && (
                                <div
                                    className="delete-btn"
                                    onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }}
                                    style={{
                                        opacity: 0,
                                        padding: '8px',
                                        borderRadius: '6px',
                                        flexShrink: 0,
                                        transition: 'opacity 0.15s ease',
                                        marginRight: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Trash2 size={16} color="#ffffff" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer - Settings Button */}
            <div style={{
                marginTop: 'auto',
                borderTop: '1px solid var(--theme-border)',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0
            }}>
                <button
                    onClick={onOpenSettings}
                    title="Settings"
                    style={{
                        width: '100%',
                        padding: '8px',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: '10px',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        minWidth: 0,
                        overflow: 'hidden'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--theme-surface-hover)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                >
                    <div style={{
                        width: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <SettingsIcon size={18} strokeWidth={2} />
                    </div>
                    {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Settings</span>}
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
            transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
            pointerEvents: view === 'settings' ? 'all' : 'none',
            backgroundColor: 'var(--theme-surface)',
            boxSizing: 'border-box'
        }}>


            {/* Content Area - grows to push footer down */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: isCollapsed ? '8px 6px 0' : '16px 12px 0', overflow: 'hidden' }}>
                {/* Navigation */}
                <div className="nav-menu" style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    minWidth: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}>
                    {[
                        { id: 'usage', label: 'Usage', icon: <ChartNoAxesCombined size={18} /> },
                        { id: 'models', label: 'Models', icon: <Cpu size={18} /> },
                        { id: 'themes', label: 'Themes', icon: <Box size={18} /> },
                        { id: 'preferences', label: 'API Keys', icon: <Key size={18} /> },
                        { id: 'tools', label: 'Tools', icon: <Sparkles size={18} /> }
                    ].map((item, index) => (
                        <button
                            key={item.id}
                            onClick={() => onNavigateSettings(item.id)}
                            className={`nav-item animate-sidebar-item ${activeSettingsSection === item.id ? 'active' : ''}`}
                            style={{
                                padding: isCollapsed ? '8px' : '10px 12px',
                                fontSize: '0.9rem',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                animationDelay: `${index * 0.05}s`,
                                minWidth: 0,
                                overflow: 'hidden',
                                width: isCollapsed ? '36px' : '100%'
                            }}
                            title={isCollapsed ? item.label : ''}
                        >
                            <div style={{
                                width: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                {item.icon}
                            </div>
                            {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                        </button>
                    ))}
                </div>

                {/* GitHub Card - Compact vs Full - positioned above footer */}
                <div style={{ marginTop: 'auto' }}>
                    {isCollapsed ? (
                        <div
                            onClick={() => window.open('https://github.com/solnikhil/ZuraAI', '_blank')}
                            style={{
                                padding: '14px',
                                background: 'var(--theme-surface)',
                                border: '1px solid var(--theme-border)',
                                borderRadius: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
                                boxShadow: 'var(--theme-shadow-sm)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            title="Star on GitHub"
                            onMouseEnter={e => {
                                e.currentTarget.style.boxShadow = `0 4px 20px var(--theme-accent-muted)`;
                                e.currentTarget.style.borderColor = 'var(--theme-accent)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.boxShadow = 'var(--theme-shadow-sm)';
                                e.currentTarget.style.borderColor = 'var(--theme-border)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <Github size={22} color="var(--theme-accent)" />
                        </div>
                    ) : (
                        <div
                            onClick={() => window.open('https://github.com/solnikhil/ZuraAI', '_blank')}
                            style={{
                                padding: '16px',
                                background: 'var(--theme-surface)',
                                border: '1px solid var(--theme-border)',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden',
                                transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
                                boxShadow: 'var(--theme-shadow-sm)'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'var(--theme-accent)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--theme-border)';
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Github size={24} color="var(--theme-accent)" />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>Zura AI</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)' }}>Star on GitHub</div>
                                </div>
                                <Star size={16} fill="var(--theme-accent)" color="var(--theme-accent)" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer - Back to Chat Button */}
            <div style={{
                marginTop: 'auto',
                borderTop: '1px solid var(--theme-border)',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0
            }}>
                <button
                    onClick={onCloseSettings}
                    style={{
                        width: '100%',
                        padding: '8px',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'all 0.2s ease',
                        minWidth: 0,
                        overflow: 'hidden'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                    title={isCollapsed ? "Back to Chat" : ""}
                >
                    <div style={{
                        width: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <ArrowLeft size={20} strokeWidth={2} />
                    </div>
                    {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Back to Chat</span>}
                </button>
            </div>
        </div >
    )

    return (
        <div style={{
            width: sidebarHidden ? '0px' : (isCollapsed ? '60px' : '260px'),
            background: 'var(--theme-surface)',
            borderRight: sidebarHidden ? 'none' : '1px solid var(--theme-border)',
            boxShadow: sidebarHidden ? 'none' : 'var(--theme-shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
            position: 'relative',
            overflow: 'hidden',
            pointerEvents: sidebarHidden ? 'none' : 'auto'
        }}>
            {renderChatContent()}
            {renderSettingsContent()}

            <style>{`
                .session-item:hover { background-color: var(--theme-surface-hover) !important; }
                .session-item:hover .delete-btn { opacity: 1 !important; }
                .delete-btn:hover { background-color: var(--theme-surface-active) !important; }

                /* Custom Scrollbar */
                ::-webkit-scrollbar {
                    width: 4px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: var(--theme-border);
                    border-radius: 2px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: var(--theme-border-hover);
                }
                ::-webkit-scrollbar-thumb:active {
                    background: var(--theme-border-active);
                }

                .toggle-switch { width: 32px; height: 18px; background: rgba(255,255,255,0.1); border-radius: 9px; position: relative; cursor: pointer; transition: background 0.2s; }
                .toggle-thumb { width: 14px; height: 14px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
                .toggle-switch.active .toggle-thumb { transform: translateX(14px); }
                .toggle-switch.active { background: #fff; }

                .btn-signout { width: 100%; padding: 10px; border: 1px solid var(--theme-border); background: transparent; border-radius: 12px; color: var(--theme-text-secondary); font-size: 0.9rem; cursor: pointer; display: flex; alignItems: center; justifyContent: center; gap: 8px; transition: all 0.2s; }
                .btn-signout:hover { background: var(--theme-surface-hover); color: #fff; border-color: var(--theme-border-hover); }

                .nav-item { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 16px; color: var(--theme-text-secondary); background: transparent; border: none; cursor: pointer; text-align: left; font-size: 0.9rem; font-weight: 500; transition: all 0.2s; width: 100%; box-sizing: border-box; }
                .nav-item:hover { color: var(--theme-text-primary); background: var(--theme-surface-hover); }
                .nav-item.active { background: var(--theme-accent-muted); color: var(--theme-accent); }

                .quick-action-btn:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important; }

                @keyframes blur-in-up {
                    0% { opacity: 0; transform: translateY(10px); filter: blur(5px); }
                    100% { opacity: 1; transform: translateY(0); filter: blur(0); }
                }
                .animate-sidebar-item {
                    animation: blur-in-up 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) backwards;
                }

                @keyframes fade-in-slide {
                    0% { opacity: 0; transform: translateY(-8px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .library-title {
                    animation: fade-in-slide 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) backwards;
                }
                .quick-action-btn {
                    animation: fade-in-slide 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) backwards;
                }
                .quick-action-btn:nth-child(1) { animation-delay: 0.05s; }
                .quick-action-btn:nth-child(2) { animation-delay: 0.1s; }
            `}</style>
        </div>
    )
}
