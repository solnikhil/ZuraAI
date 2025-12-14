import React, { useState } from 'react'
import { Plus, Search, MessageSquare, Trash2, Settings as SettingsIcon, PanelLeft, LayoutDashboard, ChevronDown, User, LogOut, ChartNoAxesCombined, Cpu, Key, Link, Brain, ArrowLeft, Github, Star } from 'lucide-react'
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
                >
                    <Plus size={20} />
                    {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>New Chat</span>}
                </button>

                {/* Search */}
                {isCollapsed ? (
                    <button onClick={() => setIsCollapsed(false)} style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', borderRadius: '10px', marginBottom: '10px' }}>
                        <Search size={20} />
                    </button>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '10px' }}>
                        <Search size={14} color="#666" style={{ marginRight: '10px', flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.85rem', width: '100%', outline: 'none' }}
                        />
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
                    <div onClick={() => setIsListExpanded(!isListExpanded)} style={{ fontSize: '0.85rem', color: '#888', padding: '8px 4px', marginTop: '4px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                        <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: isListExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                        <span>Your chats</span>
                    </div>
                )}

                <div style={{ display: isListExpanded && !isCollapsed ? 'flex' : 'none', flexDirection: 'column', gap: '2px' }}>
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
                                padding: '8px 8px',
                                cursor: 'pointer',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                color: currentSessionId === session.id ? '#fff' : '#b4b4b4',
                                backgroundColor: currentSessionId === session.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                transition: 'all 0.15s ease',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                animationDelay: `${index * 0.05}s`
                            }}
                        >
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: isCollapsed ? 'none' : 'block', minWidth: 0 }}>{session.title}</span>
                            {!isCollapsed && (
                                <div
                                    className="delete-btn"
                                    onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }}
                                    style={{
                                        opacity: 0,
                                        padding: '4px',
                                        borderRadius: '6px',
                                        visibility: currentSessionId === session.id ? 'visible' : 'hidden',
                                        flexShrink: 0
                                    }}
                                >
                                    <Trash2 size={13} color="#888" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer (Model Select + Settings Btn) */}
            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                padding: isCollapsed ? '12px 0' : '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isCollapsed ? 'center' : 'stretch'
            }}>


                <button onClick={onOpenSettings} title="Settings" style={{ width: isCollapsed ? '40px' : '100%', padding: isCollapsed ? '0' : '10px 12px', cursor: 'pointer', borderRadius: '10px', border: 'none', background: 'transparent', color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: '10px' }}>
                    <SettingsIcon size={20} />
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
            padding: '20px 16px',
            backgroundColor: '#040812' // Ensure BG covers chat list

        }}>


            {/* Header */}
            <div style={{
                padding: '0 0 16px 0',
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

            {/* GitHub Card - Compact vs Full */}
            {isCollapsed ? (
                <div
                    onClick={() => window.open('https://github.com/solnikhil/ZuraAI', '_blank')}
                    style={{
                        padding: '12px',
                        marginBottom: '24px',
                        background: 'linear-gradient(145deg, #1a1a1a, #0a0a0a)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}
                    title="Star on GitHub"
                    onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.4)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    <Github size={24} color="#fff" />
                </div>
            ) : (
                <div
                    onClick={() => window.open('https://github.com/solnikhil/ZuraAI', '_blank')}
                    style={{
                        padding: '24px',
                        marginBottom: '24px',
                        background: 'linear-gradient(145deg, #1a1a1a, #0a0a0a)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '24px',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.5)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        const badge = e.currentTarget.querySelector('.github-star-badge') as HTMLElement;
                        if (badge) {
                            badge.style.background = 'rgba(255, 215, 0, 0.15)';
                            badge.style.color = '#FFD700';
                        }
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                        const badge = e.currentTarget.querySelector('.github-star-badge') as HTMLElement;
                        if (badge) {
                            badge.style.background = 'rgba(255,255,255,0.05)';
                            badge.style.color = '#ccc';
                        }
                    }}
                >
                    {/* Subtle Grid Pattern Background */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                        opacity: 0.3,
                        pointerEvents: 'none'
                    }} />

                    {/* Glow Effect */}
                    <div style={{
                        position: 'absolute',
                        top: '-50%',
                        left: '-50%',
                        width: '200%',
                        height: '200%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
                        transform: 'rotate(45deg)',
                        pointerEvents: 'none'
                    }} />

                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: '16px',
                            background: 'linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#1a1a1a',
                            boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
                        }}>
                            <Github size={32} strokeWidth={2.5} />
                        </div>

                        <div style={{ textAlign: 'center', width: '100%' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '8px', letterSpacing: '-0.02em' }}>Zura AI</div>

                            <div className="github-star-badge" style={{
                                fontSize: '0.85rem',
                                color: '#ccc',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.05)',
                                padding: '8px 16px',
                                borderRadius: '12px',
                                transition: 'all 0.3s ease',
                                border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                <Star size={14} fill="#FFD700" color="#FFD700" />
                                <span style={{ fontWeight: 500 }}>Star on GitHub</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="nav-menu" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                {[
                    { id: 'usage', label: 'Usage', icon: <ChartNoAxesCombined size={18} /> },
                    { id: 'models', label: 'Models', icon: <Cpu size={18} /> },
                    { id: 'preferences', label: 'API Keys', icon: <Key size={18} /> },
                    { id: 'connectors', label: 'Connectors', icon: <Link size={18} /> },
                    { id: 'memories', label: 'Memories', icon: <Brain size={18} /> }
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


            {/* Bottom Actions - Back to Chat */}
            <div style={{
                marginTop: 'auto',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255,255,255,0.06)'
            }}>
                <button
                    onClick={onCloseSettings}
                    style={{
                        width: '100%',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'transparent',
                        color: '#aaa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        gap: '10px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                        e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = '#aaa'
                    }}
                    title={isCollapsed ? "Back to Chat" : ""}
                >
                    <ArrowLeft size={20} />
                    {!isCollapsed && <span>Back to Chat</span>}
                </button>
            </div>
        </div >
    )

    return (
        <div style={{
            width: isCollapsed ? '72px' : '280px',
            background: '#040812',
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
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
                
                .toggle-switch { width: 32px; height: 18px; background: #333; border-radius: 9px; position: relative; cursor: pointer; transition: background 0.2s; }
                .toggle-thumb { width: 14px; height: 14px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
                .toggle-switch.active .toggle-thumb { transform: translateX(14px); }
                .toggle-switch.active { background: #fff; }
                
                .btn-signout { width: 100%; padding: 10px; border: 1px solid #333; background: transparent; border-radius: 12px; color: #ccc; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
                .btn-signout:hover { background: #1a1a1a; color: #fff; border-color: #444; }
                
                .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 16px; color: #888; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 0.9rem; font-weight: 500; transition: all 0.2s; width: 100%; }
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
