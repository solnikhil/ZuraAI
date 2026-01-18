import React, { useState, useRef, useEffect } from 'react'
import {
    Plus, Search, MessageSquare, Trash2, SettingsIcon,
    LayoutDashboard, ChevronDown, User, LogOut, ChartNoAxesCombined, Cpu,
    Key, ArrowLeft, Github, Star, FileEdit, X, Box, Brain, Command, FileText
} from '../icons'
import { MessageCircleIcon, TrashIcon } from '../icons'

import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useAppShell } from '../../contexts/AppShellContext'
import { usePDFDocuments } from '../../contexts/PDFDocumentContext'
import type { PDFChatSession } from '../../types/pdf'
import { DocumentTabs, type DocumentTabInfo } from '../PDFChat/DocumentTabs'


interface SidebarProps {
    view: 'chat' | 'pdf' | 'settings'
    onOpenSettings: () => void
    onCloseSettings: () => void
    onNavigateToPDF: () => void
    onNavigateToChat?: () => void
    onLoadRecentPDF?: (filePath: string) => void
    onSwitchPDFSession?: (sessionId: string) => void
    activePDFSessionId?: string | null
    activeSettingsSection: string
    onNavigateSettings: (section: string) => void
    hasUnsavedSettings?: boolean
}

export default function Sidebar({ view, onOpenSettings, onCloseSettings, onNavigateToPDF, onNavigateToChat, onLoadRecentPDF, onSwitchPDFSession, activePDFSessionId, activeSettingsSection, onNavigateSettings, hasUnsavedSettings }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const { sidebarCollapsed: isCollapsed, sidebarHidden } = useAppShell()
    const [isListExpanded, setIsListExpanded] = useState(true)
    const [isStarredPDFsExpanded, setIsStarredPDFsExpanded] = useState(true)
    const [isPDFSessionsExpanded, setIsPDFSessionsExpanded] = useState(true)
    const [starredPDFs, setStarredPDFs] = useState<Array<{ filePath: string; fileName: string; starredAt: number }>>([])
    const [pdfSessions, setPdfSessions] = useState<PDFChatSession[]>([])
    const [isLoadingStarredPDFs, setIsLoadingStarredPDFs] = useState(false)
    const [isLoadingPDFSessions, setIsLoadingPDFSessions] = useState(false)
    const { sessions, currentSessionId, switchSession, deleteSession, clearCurrentSession } = useChatHistory()
    const { settings, updateSettings } = useSettings()
    const { loadedDocuments: pdfDocuments, setLoadedDocuments, activeDocumentId, setActiveDocumentId } = usePDFDocuments()

    // Settings UI State
    const [blurInfo, setBlurInfo] = useState(false)


    // Fetch starred PDF documents when in PDF mode
    useEffect(() => {
        const fetchStarredPDFs = () => {
            if (view === 'pdf') {
                setIsLoadingStarredPDFs(true)
                try {
                    const raw = localStorage.getItem('zura-pdf-starred-v1')
                    const parsed = raw ? JSON.parse(raw) : []
                    const docs = Array.isArray(parsed) ? parsed : []
                    setStarredPDFs(docs)
                } catch (error) {
                    console.error('[Sidebar] Error fetching starred PDFs:', error)
                    setStarredPDFs([])
                } finally {
                    setIsLoadingStarredPDFs(false)
                }
            }
        }

        fetchStarredPDFs()

        const handleStarredUpdate = () => fetchStarredPDFs()
        window.addEventListener('pdf-starred-updated', handleStarredUpdate)
        return () => window.removeEventListener('pdf-starred-updated', handleStarredUpdate)
    }, [view])

    // Fetch PDF chat sessions when in PDF mode
    useEffect(() => {
        const fetchPDFSessions = async () => {
            if (view === 'pdf' && window.ipcRenderer) {
                setIsLoadingPDFSessions(true)
                try {
                    const sessions = await window.ipcRenderer.invoke('pdf-chat:get-sessions')
                    setPdfSessions(sessions || [])
                } catch (error) {
                    console.error('[Sidebar] Error fetching PDF sessions:', error)
                    setPdfSessions([])
                } finally {
                    setIsLoadingPDFSessions(false)
                }
            }
        }
        
        fetchPDFSessions()
    }, [view])

    // Handler to delete a PDF session
    const handleDeletePDFSession = async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (window.ipcRenderer) {
            try {
                await window.ipcRenderer.invoke('pdf-chat:delete-session', sessionId)
                setPdfSessions(prev => prev.filter(s => s.id !== sessionId))
            } catch (error) {
                console.error('[Sidebar] Error deleting PDF session:', error)
            }
        }
    }

    // Settings navigation items
    const navItems = [
        { id: 'usage', label: 'Usage', icon: <ChartNoAxesCombined size={18} /> },
        { id: 'models', label: 'Models', icon: <Cpu size={18} /> },
        { id: 'themes', label: 'Themes', icon: <Box size={18} /> },
        { id: 'preferences', label: 'API Keys', icon: <Key size={18} /> },
        { id: 'commandbar', label: 'Command Bar', icon: <Command size={18} /> },
        { id: 'rag', label: 'PDF RAG', icon: <FileText size={18} /> }
    ]

    const filteredSessions = sessions.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Helper to render Chat List Content
    const renderChatContent = () => (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            opacity: (view === 'chat' || view === 'pdf') ? 1 : 0,
            transform: (view === 'chat' || view === 'pdf') ? 'translateX(0)' : 'translateX(-20px)',
            transition: 'all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
            pointerEvents: (view === 'chat' || view === 'pdf') ? 'all' : 'none',
            position: (view === 'chat' || view === 'pdf') ? 'relative' : 'absolute',
            width: '100%'
        }}>
            {/* Document Tabs - Only visible in PDF mode */}
            {view === 'pdf' && (
                <div style={{
                    borderBottom: '1px solid var(--theme-border)',
                    backgroundColor: 'var(--theme-surface)',
                }}>
                    <DocumentTabs
                        documents={pdfDocuments}
                        activeDocumentId={activeDocumentId}
                        onTabSelect={(docId) => {
                            setActiveDocumentId(docId)
                            // Notify PDFChatLayout to switch documents
                            window.dispatchEvent(new CustomEvent('pdf:switch-document', { detail: { documentId: docId } }))
                        }}
                        onTabClose={(docId) => {
                            // Update the loaded documents map
                            setLoadedDocuments((prev: Map<string, DocumentTabInfo>) => {
                                const updated = new Map(prev);
                                updated.delete(docId);
                                return updated;
                            });
                            // Notify PDFChatLayout to unload the document
                            window.dispatchEvent(new CustomEvent('pdf:close-document', { detail: { documentId: docId } }));
                        }}
                        onAddDocument={() => {
                            // Trigger file picker via event
                            window.dispatchEvent(new CustomEvent('pdf:add-document'))
                        }}
                    />
                </div>
            )}

            {/* New PDF Button - Only visible in PDF mode */}
            {view === 'pdf' && (
                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('pdf:add-document'))
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        margin: '8px',
                        background: 'var(--theme-surface-active)',
                        border: '1px solid var(--theme-border)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: 'var(--theme-text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--theme-surface-hover)'
                        e.currentTarget.style.borderColor = 'var(--theme-border-hover)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--theme-surface-active)'
                        e.currentTarget.style.borderColor = 'var(--theme-border)'
                    }}
                >
                    <Plus size={16} />
                    New PDF
                </button>
            )}

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
                {/* Starred PDFs Section - Only visible in PDF mode */}
                {view === 'pdf' && !isCollapsed && (
                    <>
                        <div
                            onClick={() => setIsStarredPDFsExpanded(!isStarredPDFsExpanded)}
                            onMouseEnter={e => {
                                const chevron = e.currentTarget.querySelector('.chevron-icon-pdf') as HTMLElement
                                if (chevron) chevron.style.opacity = '1'
                            }}
                            onMouseLeave={e => {
                                const chevron = e.currentTarget.querySelector('.chevron-icon-pdf') as HTMLElement
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
                            <span>Starred PDFs</span>
                            <ChevronDown
                                className="chevron-icon-pdf"
                                size={12}
                                style={{
                                    transition: 'transform 0.2s, opacity 0.2s',
                                    transform: isStarredPDFsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    opacity: 0,
                                    marginLeft: 'auto'
                                }}
                            />
                        </div>

                        <div style={{
                            display: isStarredPDFsExpanded ? 'flex' : 'none',
                            flexDirection: 'column',
                            gap: '1px',
                            minWidth: 0,
                            marginBottom: '8px'
                        }}>
                            {isLoadingStarredPDFs ? (
                                <div style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                    color: 'var(--theme-text-muted)',
                                    fontStyle: 'italic'
                                }}>
                                    Loading...
                                </div>
                            ) : starredPDFs.length === 0 ? (
                                <div style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                    color: 'var(--theme-text-muted)',
                                    fontStyle: 'italic'
                                }}>
                                    No starred documents
                                </div>
                            ) : (
                                starredPDFs.map((doc, index) => (
                                    <div
                                        key={doc.filePath}
                                        onClick={() => onLoadRecentPDF?.(doc.filePath)}
                                        className="session-item animate-sidebar-item"
                                        title={doc.filePath}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px 0 4px 6px',
                                            cursor: 'pointer',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            color: 'var(--theme-text-primary)',
                                            backgroundColor: 'transparent',
                                            borderLeft: '2px solid transparent',
                                            transition: 'all 0.15s ease',
                                            justifyContent: 'flex-start',
                                            animationDelay: `${index * 0.05}s`,
                                            minWidth: 0,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div style={{
                                            width: '16px',
                                            height: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            color: 'var(--theme-text-muted)'
                                        }}>
                                            <FileText size={14} strokeWidth={2} />
                                        </div>
                                        <span style={{
                                            flex: 1,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            minWidth: 0
                                        }}>{doc.fileName}</span>
                                        <Star size={12} style={{ color: '#facc15', marginRight: '8px' }} />
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* PDF Sessions Section - Only visible in PDF mode */}
                {view === 'pdf' && !isCollapsed && (
                    <>
                        <div
                            onClick={() => setIsPDFSessionsExpanded(!isPDFSessionsExpanded)}
                            onMouseEnter={e => {
                                const chevron = e.currentTarget.querySelector('.chevron-icon-sessions') as HTMLElement
                                if (chevron) chevron.style.opacity = '1'
                            }}
                            onMouseLeave={e => {
                                const chevron = e.currentTarget.querySelector('.chevron-icon-sessions') as HTMLElement
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
                            <span>PDF Sessions</span>
                            <ChevronDown
                                className="chevron-icon-sessions"
                                size={12}
                                style={{
                                    transition: 'transform 0.2s, opacity 0.2s',
                                    transform: isPDFSessionsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    opacity: 0,
                                    marginLeft: 'auto'
                                }}
                            />
                        </div>

                        <div style={{
                            display: isPDFSessionsExpanded ? 'flex' : 'none',
                            flexDirection: 'column',
                            gap: '1px',
                            minWidth: 0,
                            marginBottom: '8px'
                        }}>
                            {isLoadingPDFSessions ? (
                                <div style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                    color: 'var(--theme-text-muted)',
                                    fontStyle: 'italic'
                                }}>
                                    Loading...
                                </div>
                            ) : pdfSessions.length === 0 ? (
                                <div style={{
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                    color: 'var(--theme-text-muted)',
                                    fontStyle: 'italic'
                                }}>
                                    No sessions
                                </div>
                            ) : (
                                pdfSessions.map((session, index) => (
                                    <div
                                        key={session.id}
                                        onClick={() => onSwitchPDFSession?.(session.id)}
                                        className="session-item animate-sidebar-item"
                                        data-active={activePDFSessionId === session.id ? "true" : "false"}
                                        title={session.title}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px 0 4px 6px',
                                            cursor: 'pointer',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            color: 'var(--theme-text-primary)',
                                            backgroundColor: activePDFSessionId === session.id ? 'var(--theme-accent-muted)' : 'transparent',
                                            borderLeft: activePDFSessionId === session.id ? '2px solid var(--theme-accent)' : '2px solid transparent',
                                            transition: 'all 0.15s ease',
                                            justifyContent: 'flex-start',
                                            animationDelay: `${index * 0.05}s`,
                                            minWidth: 0,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div style={{
                                            width: '16px',
                                            height: '16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            color: activePDFSessionId === session.id ? 'var(--theme-accent)' : 'var(--theme-text-muted)'
                                        }}>
                                            <MessageSquare size={14} strokeWidth={2} />
                                        </div>
                                        <span style={{
                                            flex: 1,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            minWidth: 0
                                        }}>{session.title}</span>
                                        <div
                                            className="delete-btn"
                                            onClick={(e) => handleDeletePDFSession(session.id, e)}
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
                                            <TrashIcon size={16} dangerHover />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {!isCollapsed && filteredSessions.length > 0 && view !== 'pdf' && (
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
                    display: isListExpanded && !isCollapsed && view !== 'pdf' ? 'flex' : 'none',
                    flexDirection: 'column',
                    gap: '1px',
                    minWidth: 0
                }}>
                    {filteredSessions.map((session, index) => (
                        <div
                            key={session.id}
                            onClick={() => switchSession(session.id)}
                            className="session-item animate-sidebar-item"
                            data-active={currentSessionId === session.id ? "true" : "false"}
                            title={isCollapsed ? session.title : ''}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 0 4px 6px',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: 'var(--theme-text-primary)',
                                backgroundColor: currentSessionId === session.id ? 'var(--theme-accent-muted)' : 'transparent',
                                borderLeft: currentSessionId === session.id ? '2px solid var(--theme-accent)' : '2px solid transparent',
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
                                minWidth: 0,
                                paddingLeft: '4px'
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
                                    <TrashIcon size={16} dangerHover />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer - Settings Button or Back to LLM Chat */}
            <div style={{
                marginTop: 'auto',
                borderTop: '1px solid var(--theme-border)',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0
            }}>
                {view === 'pdf' ? (
                    /* Back to LLM Chat Button - Only in PDF mode */
                    <button
                        onClick={onNavigateToChat}
                        title="Back to LLM Chat"
                        style={{
                            width: '100%',
                            padding: '8px',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--theme-text-primary)',
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
                            <MessageCircleIcon size={18} strokeWidth={2} />
                        </div>
                        {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Back to LLM Chat</span>}
                    </button>
                ) : (
                    /* Settings Button - Chat mode */
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
                            color: 'var(--theme-text-primary)',
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
                )}
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
            boxSizing: 'border-box'
        }}>


            {/* Content Area - grows to push footer down */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '8px 12px 0', overflow: 'hidden' }}>
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
                    {navItems.map((item, index) => (
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

                {/* GitHub Card removed for debugging sidebar expansion */}
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
                        color: 'var(--theme-text-primary)',
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
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            transition: 'width 0.2s ease, opacity 0.15s ease',
            position: 'relative',
            overflow: 'hidden',
            pointerEvents: sidebarHidden ? 'none' : 'auto'
        }}>
            {renderChatContent()}
            {renderSettingsContent()}

            <style>{`
                .session-item:hover { background-color: var(--theme-surface-hover); }
                .session-item[style*="accent-muted"]:hover { background-color: var(--theme-accent-muted) !important; }
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

                .nav-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; color: var(--theme-text-primary); background: transparent; border: none; cursor: pointer; text-align: left; font-size: 0.85rem; font-weight: 500; transition: all 0.15s ease; width: 100%; box-sizing: border-box; }
                .nav-item:hover { background: var(--theme-surface-hover); }
                .nav-item.active { background: var(--theme-surface-active); }

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
