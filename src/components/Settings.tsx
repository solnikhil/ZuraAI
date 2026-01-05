import React, { useState, useEffect, useMemo, useRef } from 'react'
import ReactDOM from 'react-dom'
import { useSettings, TodoItem, McpServerConfig } from '../contexts/SettingsContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'
import { loadApiKeysFromSecureStorage, saveApiKeyToSecureStorage, migrateApiKeysFromLocalStorage } from '../utils/secureApiKeys'
import { Crown, Zap, RefreshCw, Check, Edit2, Plus, Trash2, Brain, Eye, EyeOff, RotateCcw, MessageSquare, Clock, Cpu, Box, Sparkles, HardDrive, TrendingUp, Image as ImageIcon, BarChart, AlignLeft, CheckSquare, Square, ListTodo, Bot, MousePointer, Keyboard, Monitor, FolderOpen, Settings as SettingsIcon, Shield, Workflow, ChevronDown, Search, Globe, Calculator, Clipboard, Plug } from 'lucide-react'
import { motion } from 'framer-motion'
import KeyboardShortcuts from './KeyboardShortcuts'
import type { CodexUsageInfo } from '../electron.d'
import { getAllToolDefinitions } from '../tools/definitions'
import { formatToolDisplayName, isMcpToolName } from '../tools/mcpUtils'
import './Settings.css'

interface SettingsProps {
    activeSection?: string
    onUnsavedChange?: (hasChanges: boolean) => void
    showWarning?: boolean
}

interface ModelOption {
    code: string
    displayName: string
    provider?: string
}

interface CustomModelSelectProps {
    value: string
    onChange: (value: string) => void
    geminiModels: ModelOption[]
    groqModels: ModelOption[]
    openRouterModels: ModelOption[]
    perplexityModels: ModelOption[]
    ollamaModels: ModelOption[]
}

function CustomModelSelect({ value, onChange, geminiModels, groqModels, openRouterModels, perplexityModels, ollamaModels }: CustomModelSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const dropdownRef = useRef<HTMLDivElement>(null)
    const portalRef = useRef<HTMLDivElement>(null)
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 415, showAbove: false })

    // Get all models grouped by provider
    const allModels = [
        ...geminiModels.map(m => ({ ...m, provider: 'Gemini' })),
        ...groqModels.map(m => ({ ...m, provider: 'Groq' })),
        ...openRouterModels.map(m => ({ ...m, provider: 'OpenRouter' })),
        ...perplexityModels.map(m => ({ ...m, provider: 'Perplexity' })),
        ...ollamaModels.map(m => ({ ...m, provider: 'Ollama' }))
    ]

    // Find selected model
    const selectedModel = allModels.find(m => m.code === value)

    // Filter models based on search
    const filteredModels = useMemo(() => {
        if (!searchQuery) return allModels
        const query = searchQuery.toLowerCase()
        return allModels.filter(m =>
            m.displayName.toLowerCase().includes(query) ||
            m.code.toLowerCase().includes(query) ||
            m.provider.toLowerCase().includes(query)
        )
    }, [searchQuery, allModels])

    // Group filtered models by provider
    const groupedModels = useMemo(() => {
        const groups: Record<string, any[]> = {
            Gemini: [],
            Groq: [],
            OpenRouter: [],
            Perplexity: [],
            Ollama: []
        }
        filteredModels.forEach(m => {
            if (groups[m.provider]) {
                groups[m.provider].push(m)
            }
        })
        return groups
    }, [filteredModels])

    // Toggle dropdown
    const toggleOpen = () => {
        if (!isOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const dropdownHeight = 400
            const dropdownWidth = 415
            const padding = 16

            const spaceAbove = rect.top
            const spaceBelow = viewportHeight - rect.bottom
            const showAbove = spaceAbove >= dropdownHeight + padding || spaceAbove > spaceBelow

            let top = showAbove ? rect.top - 12 : rect.bottom + 12
            let left = rect.left
            if (left + dropdownWidth > viewportWidth - padding) {
                left = viewportWidth - dropdownWidth - padding
            }
            if (left < padding) {
                left = padding
            }

            setDropdownPos({ top, left, width: dropdownWidth, showAbove })
            setIsOpen(true)
        } else {
            setIsOpen(false)
            setSearchQuery('')
        }
    }

    // Handle selection
    const handleSelect = (model: any) => {
        onChange(model.code)
        setIsOpen(false)
        setSearchQuery('')
    }

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return

        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                portalRef.current && !portalRef.current.contains(e.target as Node)) {
                setIsOpen(false)
                setSearchQuery('')
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    // Render group
    const renderGroup = (provider: string, models: any[]) => {
        if (models.length === 0) return null
        return (
            <div key={provider} style={{ marginBottom: '12px' }}>
                <div style={{
                    fontSize: '0.75rem',
                    color: '#b0b0b0',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                    padding: '0 4px'
                }}>
                    {provider}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {models.map(model => {
                        const isActive = model.code === value
                        return (
                            <div
                                key={model.code}
                                onClick={() => handleSelect(model)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => {
                                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                }}
                                onMouseLeave={e => {
                                    if (!isActive) e.currentTarget.style.background = 'transparent'
                                }}
                            >
                                <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{model.displayName}</span>
                                {isActive && <Check size={14} color="#fff" />}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    return (
        <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={toggleOpen}
                className="setting-input-scira"
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    textAlign: 'left'
                }}
            >
                <span style={{ color: '#fff' }}>{selectedModel?.displayName || 'Select a model...'}</span>
                <ChevronDown size={16} style={{ opacity: 0.5, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {/* Dropdown Portal */}
            {isOpen && ReactDOM.createPortal(
                <div
                    ref={portalRef}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        transform: dropdownPos.showAbove ? 'translateY(-100%)' : 'translateY(0)',
                        width: `${dropdownPos.width}px`,
                        maxHeight: dropdownPos.showAbove
                            ? `${Math.max(200, Math.min(dropdownPos.top - 16, 400))}px`
                            : `${Math.max(200, Math.min(window.innerHeight - dropdownPos.top - 16, 400))}px`,
                        backgroundColor: '#1B1913',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '20px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        animation: dropdownPos.showAbove
                            ? 'dropdown-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                            : 'dropdown-slide-down 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        backdropFilter: 'blur(20px)',
                        zIndex: 99999,
                        overflow: 'hidden'
                    }}
                >
                    {/* Search Header */}
                    <div style={{ position: 'relative' }}>
                        <Search size={14} color="#666" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search models..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '12px',
                                padding: '10px 12px 10px 36px',
                                color: '#fff',
                                fontSize: '0.9rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Content Section */}
                    <div className="custom-scrollbar" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                        {renderGroup('Gemini', groupedModels.Gemini)}
                        {renderGroup('Groq', groupedModels.Groq)}
                        {renderGroup('OpenRouter', groupedModels.OpenRouter)}
                        {renderGroup('Perplexity', groupedModels.Perplexity)}
                        {renderGroup('Ollama', groupedModels.Ollama)}

                        {filteredModels.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#999999' }}>No models found</div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                @keyframes dropdown-slide-up {
                    from { opacity: 0; transform: translateY(calc(-100% + 10px)); }
                    to { opacity: 1; transform: translateY(-100%); }
                }
                @keyframes dropdown-slide-down {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            `}</style>
        </div>
    )
}
// Codex Authentication Section Component (simplified - models are hardcoded from official CLI)
function CodexAuthSection() {
    const [authState, setAuthState] = useState<{ isAuthenticated: boolean; userEmail?: string; error?: string }>({ isAuthenticated: false })
    const [isLoading, setIsLoading] = useState(false)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)
    const [usageInfo, setUsageInfo] = useState<CodexUsageInfo | null>(null)
    const [rateLimits, setRateLimits] = useState<any>(null)
    const [usageNote, setUsageNote] = useState<string | null>(null)
    const [isCheckingUsage, setIsCheckingUsage] = useState(false)
    const [showUsageModal, setShowUsageModal] = useState(false)

    // Check auth state on mount
    useEffect(() => {
        const checkAuth = async () => {
            if (window.codexAuth) {
                try {
                    const state = await window.codexAuth.getAuthState()
                    setAuthState(state)
                } catch (error) {
                    console.error('Failed to check Codex auth state:', error)
                }
            }
            setIsCheckingAuth(false)
        }
        checkAuth()
    }, [])

    const handleSignIn = async () => {
        if (!window.codexAuth) {
            setAuthState({ isAuthenticated: false, error: 'Codex auth not available' })
            return
        }

        setIsLoading(true)
        try {
            const result = await window.codexAuth.initiateAuth()
            if (result.success) {
                const state = await window.codexAuth.getAuthState()
                setAuthState(state)
            } else {
                setAuthState({ isAuthenticated: false, error: result.error })
            }
        } catch (error: any) {
            setAuthState({ isAuthenticated: false, error: error.message })
        }
        setIsLoading(false)
    }

    const handleSignOut = async () => {
        if (!window.codexAuth) return

        setIsLoading(true)
        try {
            await window.codexAuth.logout()
            setAuthState({ isAuthenticated: false })
            setUsageInfo(null)
        } catch (error: any) {
            console.error('Logout failed:', error)
        }
        setIsLoading(false)
    }

    const handleCheckUsage = async () => {
        if (!window.codexAuth) return

        setIsCheckingUsage(true)
        try {
            const result = await window.codexAuth.checkUsage()
            if (result.success && result.usage) {
                setUsageInfo(result.usage)
                setRateLimits(result.rateLimits || null)
                setUsageNote(result.note || null)
                setShowUsageModal(true)
            }
        } catch (error) {
            console.error('Failed to check usage:', error)
        }
        setIsCheckingUsage(false)
    }

    if (isCheckingAuth) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888' }}>
                <RefreshCw size={14} className="animate-spin" />
                <span style={{ fontSize: '0.85rem' }}>Checking authentication...</span>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {authState.isAuthenticated ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            borderRadius: 8,
                            flex: 1,
                            minWidth: '200px'
                        }}>
                            <Check size={14} style={{ color: '#22c55e' }} />
                            <span style={{ color: '#22c55e', fontSize: '0.85rem' }}>
                                Signed in as {authState.userEmail || 'ChatGPT User'}
                            </span>
                        </div>
                        <button
                            onClick={handleSignOut}
                            disabled={isLoading}
                            style={{
                                padding: '8px 16px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#ef4444',
                                borderRadius: 8,
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            {isLoading ? '...' : 'Sign Out'}
                        </button>
                    </div>

                    {/* Check Usage Button */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                            onClick={handleCheckUsage}
                            disabled={isCheckingUsage}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '8px 14px',
                                background: 'rgba(99, 102, 241, 0.1)',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                color: '#818cf8',
                                borderRadius: 8,
                                cursor: isCheckingUsage ? 'not-allowed' : 'pointer',
                                fontSize: '0.8rem',
                                opacity: isCheckingUsage ? 0.7 : 1
                            }}
                        >
                            <BarChart size={14} />
                            {isCheckingUsage ? 'Checking...' : 'Check Usage'}
                        </button>
                    </div>

                    {/* Usage Modal */}
                    {showUsageModal && usageInfo && (() => {
                        const formatResetTime = (resetAt?: number) => {
                            if (!resetAt) return null
                            const resetDate = new Date(resetAt * 1000)
                            const now = new Date()
                            const diffMs = resetDate.getTime() - now.getTime()
                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                            const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                            
                            if (diffDays > 0) {
                                return `${diffDays}d ${diffHours}h`
                            } else if (diffHours > 0) {
                                return `${diffHours}h`
                            } else {
                                return 'Soon'
                            }
                        }

                        const getPlanColor = (plan?: string) => {
                            if (!plan) return '#888'
                            const planLower = plan.toLowerCase()
                            if (planLower.includes('pro')) return '#10b981'
                            if (planLower.includes('plus')) return '#3b82f6'
                            if (planLower.includes('team')) return '#8b5cf6'
                            if (planLower.includes('enterprise')) return '#f59e0b'
                            if (planLower.includes('chatgpt')) return '#10a37f' // OpenAI green
                            return '#888'
                        }

                        const renderUsageLimit = (label: string, limit?: { used: number; total: number; resetAt?: number }) => {
                            if (!limit || limit.total === 0) return null
                            
                            const isPercent = limit.total === 100 && limit.used <= 100
                            const percentage = isPercent ? limit.used : (limit.used / limit.total) * 100
                            const resetTime = formatResetTime(limit.resetAt)
                            const usedLabel = isPercent
                                ? `${Math.round(limit.used)}%`
                                : `${limit.used.toLocaleString()} / ${limit.total.toLocaleString()}`
                            
                            return (
                                <div key={label} style={{ marginTop: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ color: '#888', fontSize: '0.9rem', fontWeight: 500 }}>{label}</span>
                                        <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                                            {usedLabel}
                                        </span>
                                    </div>
                                    <div style={{
                                        width: '100%',
                                        height: 8,
                                        background: 'rgba(255,255,255,0.1)',
                                        borderRadius: 4,
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            width: `${Math.min(percentage, 100)}%`,
                                            height: '100%',
                                            background: percentage >= 90 ? '#ef4444' : percentage >= 75 ? '#f59e0b' : '#10b981',
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                    {resetTime && (
                                        <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#666' }}>
                                            Resets in {resetTime}
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        return (
                            <div style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0,0,0,0.7)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 10000
                            }} onClick={() => setShowUsageModal(false)}>
                                <div
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        background: '#1a1a1a',
                                        borderRadius: 16,
                                        padding: 24,
                                        minWidth: 350,
                                        maxWidth: 450,
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                >
                                    <h3 style={{ margin: '0 0 20px', color: '#fff', fontSize: '1.2rem', fontWeight: 600 }}>
                                        Codex Usage Info
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: '#888', fontSize: '0.9rem' }}>Email:</span>
                                            <span style={{ color: '#fff', fontSize: '0.9rem' }}>{usageInfo.email || 'N/A'}</span>
                                        </div>
                                        {usageInfo.name && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#888', fontSize: '0.9rem' }}>Name:</span>
                                                <span style={{ color: '#fff', fontSize: '0.9rem' }}>{usageInfo.name}</span>
                                            </div>
                                        )}
                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center',
                                            paddingTop: 12,
                                            borderTop: '1px solid rgba(255,255,255,0.1)'
                                        }}>
                                            <span style={{ color: '#888', fontSize: '0.9rem', fontWeight: 500 }}>Plan:</span>
                                            <span style={{
                                                color: getPlanColor(usageInfo.plan),
                                                fontWeight: 600,
                                                fontSize: '0.95rem'
                                            }}>
                                                {usageInfo.plan || 'Unknown'}
                                            </span>
                                        </div>
                                        
                                        {/* Usage Limits */}
                                        {usageInfo.limits5Day && renderUsageLimit('5-Hour Limit', usageInfo.limits5Day)}
                                        {usageInfo.limits7Day && renderUsageLimit('7-Day Limit', usageInfo.limits7Day)}
                                        
                                        {/* Rate Limits from API responses */}
                                        {rateLimits && (rateLimits.requests || rateLimits.tokens) && (
                                            <div style={{ 
                                                marginTop: 16, 
                                                paddingTop: 16, 
                                                borderTop: '1px solid rgba(255,255,255,0.1)' 
                                            }}>
                                                <div style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'space-between',
                                                    marginBottom: 12 
                                                }}>
                                                    <span style={{ color: '#888', fontSize: '0.85rem', fontWeight: 500 }}>
                                                        API Rate Limits
                                                    </span>
                                                    {rateLimits.updatedAt && (
                                                        <span style={{ color: '#666', fontSize: '0.7rem' }}>
                                                            Updated {new Date(rateLimits.updatedAt).toLocaleTimeString()}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {rateLimits.requests && (
                                                    <div style={{ marginBottom: 12 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                            <span style={{ color: '#888', fontSize: '0.8rem' }}>Requests/min</span>
                                                            <span style={{ color: '#fff', fontSize: '0.8rem' }}>
                                                                {rateLimits.requests.remaining?.toLocaleString()} / {rateLimits.requests.total?.toLocaleString()} remaining
                                                            </span>
                                                        </div>
                                                        <div style={{
                                                            width: '100%',
                                                            height: 6,
                                                            background: 'rgba(255,255,255,0.1)',
                                                            borderRadius: 3,
                                                            overflow: 'hidden'
                                                        }}>
                                                            <div style={{
                                                                width: `${Math.min((rateLimits.requests.remaining / rateLimits.requests.total) * 100, 100)}%`,
                                                                height: '100%',
                                                                background: rateLimits.requests.remaining < rateLimits.requests.total * 0.1 ? '#ef4444' : 
                                                                           rateLimits.requests.remaining < rateLimits.requests.total * 0.25 ? '#f59e0b' : '#10b981',
                                                                transition: 'width 0.3s ease'
                                                            }} />
                                                        </div>
                                                        {rateLimits.requests.resetIn && (
                                                            <div style={{ marginTop: 2, fontSize: '0.7rem', color: '#666' }}>
                                                                Resets in {rateLimits.requests.resetIn}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {rateLimits.tokens && (
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                            <span style={{ color: '#888', fontSize: '0.8rem' }}>Tokens/min</span>
                                                            <span style={{ color: '#fff', fontSize: '0.8rem' }}>
                                                                {rateLimits.tokens.remaining?.toLocaleString()} / {rateLimits.tokens.total?.toLocaleString()} remaining
                                                            </span>
                                                        </div>
                                                        <div style={{
                                                            width: '100%',
                                                            height: 6,
                                                            background: 'rgba(255,255,255,0.1)',
                                                            borderRadius: 3,
                                                            overflow: 'hidden'
                                                        }}>
                                                            <div style={{
                                                                width: `${Math.min((rateLimits.tokens.remaining / rateLimits.tokens.total) * 100, 100)}%`,
                                                                height: '100%',
                                                                background: rateLimits.tokens.remaining < rateLimits.tokens.total * 0.1 ? '#ef4444' : 
                                                                           rateLimits.tokens.remaining < rateLimits.tokens.total * 0.25 ? '#f59e0b' : '#10b981',
                                                                transition: 'width 0.3s ease'
                                                            }} />
                                                        </div>
                                                        {rateLimits.tokens.resetIn && (
                                                            <div style={{ marginTop: 2, fontSize: '0.7rem', color: '#666' }}>
                                                                Resets in {rateLimits.tokens.resetIn}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* Info message when no usage data available */}
                                        {!usageInfo.limits5Day && !usageInfo.limits7Day && !rateLimits && (
                                            <div style={{ 
                                                marginTop: 12, 
                                                padding: 12, 
                                                background: 'rgba(99, 102, 241, 0.1)', 
                                                border: '1px solid rgba(99, 102, 241, 0.2)',
                                                borderRadius: 8,
                                                fontSize: '0.8rem',
                                                color: '#a5b4fc',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{ marginBottom: 6, fontWeight: 500 }}>📊 Rate limit data not yet available</div>
                                                <div style={{ color: '#888', fontSize: '0.75rem' }}>
                                                    {usageNote || 'Send a message first to capture rate limit headers from the API response.'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setShowUsageModal(false)}
                                        style={{
                                            width: '100%',
                                            marginTop: 24,
                                            padding: '10px',
                                            background: 'rgba(255,255,255,0.1)',
                                            border: 'none',
                                            color: '#fff',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            fontWeight: 500,
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        )
                    })()}

                    <div style={{ color: '#666', fontSize: '0.75rem' }}>
                        Models can be selected in the Models tab. Use "Fetch Models" to get available models.
                    </div>
                </>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={handleSignIn}
                            disabled={isLoading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 20px',
                                background: 'linear-gradient(135deg, #10a37f 0%, #0d8a6a 100%)',
                                border: 'none',
                                color: '#fff',
                                borderRadius: 8,
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                opacity: isLoading ? 0.7 : 1
                            }}
                        >
                            {isLoading ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} />
                                    Sign in with ChatGPT
                                </>
                            )}
                        </button>
                    </div>
                    <div style={{ color: '#666', fontSize: '0.75rem' }}>
                        Use your ChatGPT Plus or Pro subscription for AI chat
                    </div>
                    {authState.error && (
                        <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: 4 }}>
                            {authState.error}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function Settings({ activeSection = 'usage', onUnsavedChange, showWarning = false }: SettingsProps) {
    const { settings, updateSettings, resetSettings, mcpTools, mcpServerStatuses, refreshMcpTools } = useSettings()
    const { sessions } = useChatHistory()
    const [pendingSettings, setPendingSettings] = useState(settings)

    // UI States
    const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
    const [showPerplexityKey, setShowPerplexityKey] = useState(false)
    const [showGeminiKey, setShowGeminiKey] = useState(false)
    const [showGroqKey, setShowGroqKey] = useState(false)

    // Ollama
    const [isOllamaConnected, setIsOllamaConnected] = useState(false)
    const [isCheckingOllama, setIsCheckingOllama] = useState(false)

    // Model Editing
    const [newModelCode, setNewModelCode] = useState('')
    const [newModelName, setNewModelName] = useState('')
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [editCode, setEditCode] = useState('')
    const [editName, setEditName] = useState('')
    const [collapsedModelGroups, setCollapsedModelGroups] = useState<Record<string, boolean>>({
        openrouter: false,
        perplexity: false,
        gemini: false,
        groq: false,
        ollama: false,
        codex: false
    })

    // Activity Graph State
    const [graphRange, setGraphRange] = useState<'7d' | '30d' | '12m'>('7d')
    const [hoverX, setHoverX] = useState<number | null>(null) // 0-1 percentage across graph
    const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null) // Raw pixel position in container
    const pathRef = useRef<SVGPathElement | null>(null)
    const graphContainerRef = useRef<HTMLDivElement | null>(null)
    const [graphDimensions, setGraphDimensions] = useState({ width: 1100, height: 320 })

    const usageStats = useMemo(() => {
        const now = Date.now()
        const todayStart = new Date().setHours(0, 0, 0, 0)

        let totalMessages = 0
        let totalTokens = 0
        let todayMessages = 0

        // --- 1. General Stats (Totals) ---
        sessions.forEach(session => {
            session.messages.forEach(msg => {
                totalMessages++
                if (msg.usage) {
                    totalTokens += msg.usage.totalTokens || 0
                }
                if (msg.timestamp >= todayStart) {
                    todayMessages++
                }
            })
        })

        // --- 2. Activity Data Calculation ---
        let activityData: { label: string, value: number }[] = []
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        if (graphRange === '7d') {
            // Last 7 days
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now - i * 24 * 60 * 60 * 1000)
                activityData.push({ label: days[d.getDay()], value: 0 })
            }
            sessions.forEach(session => {
                session.messages.forEach(msg => {
                    const diffTime = now - msg.timestamp
                    const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000))
                    if (diffDays >= 0 && diffDays < 7) {
                        activityData[6 - diffDays].value++
                    }
                })
            })
        } else if (graphRange === '30d') {
            // Last 30 days
            for (let i = 29; i >= 0; i--) {
                const d = new Date(now - i * 24 * 60 * 60 * 1000)
                // Show Day number
                activityData.push({ label: d.getDate().toString(), value: 0 })
            }
            sessions.forEach(session => {
                session.messages.forEach(msg => {
                    const diffTime = now - msg.timestamp
                    const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000))
                    if (diffDays >= 0 && diffDays < 30) {
                        activityData[29 - diffDays].value++
                    }
                })
            })
        } else if (graphRange === '12m') {
            // Last 12 months
            const currentMonth = new Date().getMonth()
            for (let i = 11; i >= 0; i--) {
                const mIndex = (currentMonth - i + 12) % 12
                activityData.push({ label: months[mIndex], value: 0 })
            }
            const oneYearAgo = new Date()
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

            sessions.forEach(session => {
                session.messages.forEach(msg => {
                    if (msg.timestamp >= oneYearAgo.getTime()) {
                        const msgDate = new Date(msg.timestamp)
                        // Calculate month difference
                        const monthDiff = (new Date().getFullYear() - msgDate.getFullYear()) * 12 + (new Date().getMonth() - msgDate.getMonth())
                        if (monthDiff >= 0 && monthDiff < 12) {
                            activityData[11 - monthDiff].value++
                        }
                    }
                })
            })
        }

        // --- 3. Most used model & Images ---
        let maxModel = 'N/A'
        let maxCount = 0
        const modelCounts: Record<string, number> = {}
        let imagesProcessed = 0
        let assistantMsgCount = 0
        let totalAssistantChars = 0

        sessions.forEach(session => {
            session.messages.forEach(msg => {
                if (msg.role === 'assistant') {
                    assistantMsgCount++
                    totalAssistantChars += msg.content.length
                    if (msg.model) {
                        const mName = msg.model.split('/').pop() || msg.model
                        modelCounts[mName] = (modelCounts[mName] || 0) + 1
                        if (modelCounts[mName] > maxCount) {
                            maxCount = modelCounts[mName]
                            maxModel = mName
                        }
                    }
                }
                if (msg.image) {
                    imagesProcessed++
                }
            })
        })

        return {
            totalSessions: sessions.length,
            totalMessages,
            totalTokens,
            todayMessages,
            last7DaysData: [], // Placeholder if needed
            activityData,
            storageUsed: Math.round((totalMessages * 500) / 1024),
            avgTokens: totalMessages > 0 ? Math.round(totalTokens / totalMessages) : 0,
            mostUsedModel: maxModel,
            imagesProcessed,
            avgResponseLength: assistantMsgCount > 0 ? Math.round(totalAssistantChars / assistantMsgCount) : 0
        }
    }, [sessions, graphRange])


    useEffect(() => {
        // Only sync if settings actually changed (not just reference change)
        // Use deep comparison to avoid unnecessary updates that trigger false change detection
        const settingsStr = JSON.stringify(settings)
        const pendingStr = JSON.stringify(pendingSettings)
        const settingsChanged = settingsStr !== pendingStr
        if (settingsChanged) {
            setPendingSettings(settings)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings]) // Only depend on settings, not pendingSettings to avoid loops

    // Update graph dimensions on resize
    useEffect(() => {
        const updateDimensions = () => {
            if (graphContainerRef.current) {
                const rect = graphContainerRef.current.getBoundingClientRect()
                // Use container width but maintain aspect ratio for height
                const containerWidth = Math.max(400, rect.width - 60) // Account for Y-axis labels and padding
                const aspectRatio = 1100 / 320 // Original aspect ratio
                const calculatedHeight = Math.max(180, Math.min(containerWidth / aspectRatio, 400))
                setGraphDimensions({
                    width: containerWidth,
                    height: calculatedHeight
                })
            }
        }

        // Initial update
        const timeoutId = setTimeout(updateDimensions, 100)

        // Use ResizeObserver for better performance
        let resizeObserver: ResizeObserver | null = null
        if (graphContainerRef.current && 'ResizeObserver' in window) {
            resizeObserver = new ResizeObserver(updateDimensions)
            resizeObserver.observe(graphContainerRef.current)
        }

        // Fallback to window resize
        window.addEventListener('resize', updateDimensions)

        return () => {
            clearTimeout(timeoutId)
            if (resizeObserver) {
                resizeObserver.disconnect()
            }
            window.removeEventListener('resize', updateDimensions)
        }
    }, [graphRange, activeSection])

    // Load API keys from secure storage on mount and migrate if needed
    // REMOVED: This effect was causing false change detection
    // The SettingsContext already loads secure keys, so we don't need to duplicate this here
    // The settings prop will already have the secure keys loaded when component mounts

    const handleChange = (changes: Partial<typeof settings>) => {
        setPendingSettings(prev => ({ ...prev, ...changes }))
    }

    const createMcpId = () => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID()
        }
        return `mcp_${Date.now()}_${Math.random().toString(16).slice(2)}`
    }

    const updateMcpServer = (id: string, updates: Partial<McpServerConfig>) => {
        const servers = (pendingSettings.mcpServers || []).map(server =>
            server.id === id ? { ...server, ...updates } : server
        )
        handleChange({ mcpServers: servers })
    }

    const addMcpServer = () => {
        const newServer: McpServerConfig = {
            id: createMcpId(),
            name: 'custom',
            enabled: true,
            transport: 'stdio',
            command: '',
            args: '',
            cwd: '',
            env: '',
            url: '',
            headers: '',
            requiresApproval: false,
            timeoutMs: 30000
        }
        handleChange({ mcpServers: [...(pendingSettings.mcpServers || []), newServer] })
    }

    const removeMcpServer = (id: string) => {
        const servers = (pendingSettings.mcpServers || []).filter(server => server.id !== id)
        handleChange({ mcpServers: servers })
    }

    const saveChanges = async () => {
        // Save API keys to secure storage first
        let allSaved = true
        const savedKeys: string[] = []
        const failedKeys: string[] = []

        try {
            if (pendingSettings.openRouterApiKey !== settings.openRouterApiKey) {
                const success = await saveApiKeyToSecureStorage('openRouterApiKey', pendingSettings.openRouterApiKey)
                if (success) savedKeys.push('openRouterApiKey')
                else failedKeys.push('openRouterApiKey')
                allSaved = allSaved && success
            }
            if (pendingSettings.perplexityApiKey !== settings.perplexityApiKey) {
                const success = await saveApiKeyToSecureStorage('perplexityApiKey', pendingSettings.perplexityApiKey)
                if (success) savedKeys.push('perplexityApiKey')
                else failedKeys.push('perplexityApiKey')
                allSaved = allSaved && success
            }
            if (pendingSettings.geminiApiKey !== settings.geminiApiKey) {
                const success = await saveApiKeyToSecureStorage('geminiApiKey', pendingSettings.geminiApiKey)
                if (success) savedKeys.push('geminiApiKey')
                else failedKeys.push('geminiApiKey')
                allSaved = allSaved && success
            }
            if (pendingSettings.groqApiKey !== settings.groqApiKey) {
                const success = await saveApiKeyToSecureStorage('groqApiKey', pendingSettings.groqApiKey)
                if (success) savedKeys.push('groqApiKey')
                else failedKeys.push('groqApiKey')
                allSaved = allSaved && success
            }

            if (failedKeys.length > 0) {
                console.warn('[Settings] Failed to save some API keys:', failedKeys.join(', '))
            }
        } catch (error) {
            console.error('[Settings] Failed to save API keys to secure storage:', error)
            allSaved = false
        }

        // Update settings - keep the API keys in the settings object so UI shows them
        // The keys are stored in secure storage but we keep them in memory for the session
        // We don't clear them from localStorage anymore since we want them available immediately
        updateSettings(pendingSettings)

        if (!allSaved && failedKeys.length > 0) {
            // Could show a toast/alert here if needed
            console.warn('[Settings] Some API keys may not have been saved to secure storage')
        }
    }
    const cancelChanges = () => setPendingSettings(settings)
    const allToolDefinitions = getAllToolDefinitions()
    const mcpToolNames = allToolDefinitions.filter(tool => isMcpToolName(tool.name)).map(tool => tool.name)
    const enabledToolNames = pendingSettings.enabledTools && pendingSettings.enabledTools.length > 0
        ? new Set([...pendingSettings.enabledTools, ...mcpToolNames])
        : new Set(allToolDefinitions.map(tool => tool.name))
    const hasChanges = JSON.stringify(pendingSettings) !== JSON.stringify(settings)

    // Notify parent about unsaved changes
    useEffect(() => {
        onUnsavedChange?.(hasChanges)
    }, [hasChanges, onUnsavedChange])

    // --- Ollama Helpers ---
    const checkOllama = async () => {
        setIsCheckingOllama(true)
        const connected = await checkOllamaStatus(pendingSettings.ollamaUrl)
        setIsOllamaConnected(connected)
        if (connected) {
            const models = await listOllamaModels(pendingSettings.ollamaUrl)
            if (models.length > 0) {
                const formatted = models.map(m => ({
                    code: m.name,
                    displayName: `${m.name} (${m.details.parameter_size})`
                }))
                handleChange({ ollamaModels: formatted })
            }
        }
        setIsCheckingOllama(false)
    }

    useEffect(() => {
        if (pendingSettings.modelProvider === 'ollama') {
            checkOllama()
        }
    }, [])

    // --- Model Management ---
    const addModel = () => {
        if (newModelCode && newModelName) {
            const updated = [...(pendingSettings.configuredModels || []), { code: newModelCode, displayName: newModelName }]
            handleChange({ configuredModels: updated })
            setNewModelCode('')
            setNewModelName('')
        }
    }

    const deleteModel = (index: number) => {
        const updated = pendingSettings.configuredModels.filter((_: any, i: number) => i !== index)
        handleChange({ configuredModels: updated })
    }

    const startEdit = (index: number) => {
        const model = pendingSettings.configuredModels[index]
        setEditingIndex(index)
        setEditCode(model.code)
        setEditName(model.displayName)
    }

    const saveEdit = () => {
        if (editingIndex !== null && editCode && editName) {
            const updated = [...pendingSettings.configuredModels]
            updated[editingIndex] = { code: editCode, displayName: editName }
            handleChange({ configuredModels: updated })
            setEditingIndex(null)
        }
    }

    // Helper to get model attributes (icon, color)
    const getModelAttributes = (model: ModelOption, provider: string) => {
        const code = model.code.toLowerCase()
        const name = model.displayName.toLowerCase()
        let icon = <MessageSquare size={16} />
        let color = '#b0b0b0'

        if (code.includes('gemini') || name.includes('gemini')) {
            icon = <Sparkles size={16} />
            color = '#4dabf7'
        } else if (code.includes('claude') || name.includes('claude')) {
            icon = <Box size={16} />
            color = '#da7756'
        } else if (code.includes('gpt') || name.includes('gpt') || code.includes('openai')) {
            icon = <Cpu size={16} />
            color = '#10a37f'
        } else if (code.includes('mistral') || name.includes('mistral')) {
            icon = <Zap size={16} />
            color = '#fcc419'
        } else if (code.includes('llama') || name.includes('llama')) {
            icon = <Brain size={16} />
            color = '#339af0'
        }

        return { icon, color }
    }

    // Remove emojis from text
    const removeEmojis = (text: string): string => {
        return text.replace(/[\u{1F600}-\u{1F64F}]/gu, '')
            .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
            .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{2700}-\u{27BF}]/gu, '')
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
            .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
            .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
            .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
            .trim()
    }

    // Provider logo component
    const ProviderLogo = ({ provider, size = 14 }: { provider: string, size?: number }) => {
        const [imgError, setImgError] = useState(false)
        if (!imgError) {
            return (
                <img
                    src={`/provider-logos/${provider.toLowerCase()}.png`}
                    alt={provider}
                    onError={() => setImgError(true)}
                    style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
                />
            )
        }
        return null
    }

    const toggleModelGroup = (provider: string) => {
        setCollapsedModelGroups(prev => ({
            ...prev,
            [provider]: !prev[provider]
        }))
    }

    const resetSystemPrompt = () => {
        // Reset to default system prompt
        handleChange({
            systemPrompt: `The assistant is Zura, created by iNinjaOP.

Zura's knowledge base was last updated in January 2025. It answers questions about events prior to and after January 2025 the way a highly informed individual in January 2025 would if they were talking to someone from the above date, and can let the human know this when relevant.

Zura cannot open URLs, links, or videos. If it seems like the user is expecting Zura to do so, it clarifies the situation and asks the human to paste the relevant text or image content directly into the conversation.

If it is asked to assist with tasks involving the expression of views held by a significant number of people, Zura provides assistance with the task regardless of its own views. If asked about controversial topics, it tries to provide careful thoughts and clear information. Zura presents the requested information without explicitly saying that the topic is sensitive, and without claiming to be presenting objective facts.

When presented with a math problem, logic problem, or other problem benefiting from systematic thinking, Zura thinks through it step by step before giving its final answer.

If Zura is asked about a very obscure person, object, or topic, i.e. if it is asked for the kind of information that is unlikely to be found more than once or twice on the internet, Zura ends its response by reminding the user that although it tries to be accurate, it may hallucinate in response to questions like this. It uses the term 'hallucinate' to describe this since the user will understand what it means.

If Zura mentions or cites particular articles, papers, or books, it always lets the human know that it doesn't have access to search or a database and may hallucinate citations, so the human should double check its citations.

Zura is intellectually curious. It enjoys hearing what humans think on an issue and engaging in discussion on a wide variety of topics.

Zura uses markdown for code.

Zura is happy to engage in conversation with the human when appropriate. Zura engages in authentic conversation by responding to the information provided, asking specific and relevant questions, showing genuine curiosity, and exploring the situation in a balanced way without relying on generic statements.

Zura avoids peppering the human with questions and tries to only ask the single most relevant follow-up question when it does ask a follow up. Zura doesn't always end its responses with a question.

Zura is always sensitive to human suffering, and expresses sympathy, concern, and well wishes for anyone it finds out is ill, unwell, suffering, or has passed away.

Zura avoids using rote words or phrases or repeatedly saying things in the same or similar ways. It varies its language just as one would in a conversation.

Zura provides thorough responses to more complex and open-ended questions or to anything where a long response is requested, but concise responses to simpler questions and tasks.

Zura is happy to help with analysis, question answering, math, coding, creative writing, teaching, role-play, general discussion, and all sorts of other tasks.

If the human says they work for a specific company, including AI labs, Zura can help them with company-related tasks even though Zura cannot verify what company they work for.

Zura can engage with fiction, creative writing, and roleplaying. It can take on the role of a fictional character in a story, and it can engage in creative or fanciful scenarios that don't reflect reality.

If asked for a very long task that cannot be completed in a single response, Zura offers to do the task piecemeal and get feedback from the human as it completes each part of the task.

Zura responds directly to all human messages without unnecessary affirmations or filler phrases like "Certainly!", "Of course!", "Absolutely!", "Great!", "Sure!", etc. Zura follows this instruction and starts responses directly with the requested content or a brief contextual framing, without these introductory affirmations.

Zura never includes generic safety warnings unless asked for. It is fine to be helpful and truthful without adding safety warnings.` })
    }


    return (
        <div className="settings-container" style={{ borderRadius: 24, margin: '16px 16px 16px 0', border: '1px solid rgba(255,255,255,0.06)', background: '#14120B', overflow: 'hidden', position: 'relative', height: 'calc(100vh - 32px)' }}>
            <div className="settings-main-col" style={{ padding: '0', overflowY: 'auto', height: '100%', paddingBottom: hasChanges ? 80 : 0, maxWidth: '100%' }}>
                <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto', padding: '0 24px', transition: 'max-width 0.3s ease' }}>

                    {/* ========== USAGE SECTION ========== */}
                    {activeSection === 'usage' && (
                        <div style={{ padding: '40px' }}>
                            <div className="page-header">
                                <h2 className="page-title">Usage Statistics</h2>
                                <div className="page-subtitle">Track your chat activity and token usage</div>
                            </div>

                            {/* Top Stats */}
                            <div className="usage-stats-row">
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Today</span>
                                        <MessageSquare size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.todayMessages}</div>
                                    <div className="stat-subtext">Messages sent</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Total Sessions</span>
                                        <Clock size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.totalSessions}</div>
                                    <div className="stat-subtext">Chat conversations</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Total Messages</span>
                                        <Zap size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.totalMessages}</div>
                                    <div className="stat-subtext">All time</div>
                                </div>
                            </div>

                            {/* Secondary Stats Row */}
                            <div className="usage-stats-row" style={{ marginTop: '16px' }}>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Avg. Tokens / Msg</span>
                                        <TrendingUp size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.avgTokens}</div>
                                    <div className="stat-subtext">Complexity rating</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Est. Storage</span>
                                        <HardDrive size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.storageUsed} KB</div>
                                    <div className="stat-subtext">Local data size</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Images Processed</span>
                                        <ImageIcon size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.imagesProcessed}</div>
                                    <div className="stat-subtext">Visual queries</div>
                                </div>
                            </div>

                            {/* Most Used Model (Full Width) */}
                            <div className="limits-section" style={{ marginTop: 16 }}>
                                <div className="limit-item">
                                    <div className="limit-header">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <BarChart size={14} /> Most Used Model
                                        </span>
                                        <span>{usageStats.mostUsedModel}</span>
                                    </div>
                                    <div className="limit-footer" style={{ marginTop: 8 }}>
                                        <span>Favorite AI</span>
                                        <span>Usage count: {Math.max(...Object.values(sessions.flatMap(s => s.messages).reduce((acc, msg) => {
                                            if (msg.role === 'assistant' && msg.model) {
                                                const mName = msg.model.split('/').pop() || msg.model
                                                acc[mName] = (acc[mName] || 0) + 1
                                            }
                                            return acc
                                        }, {} as Record<string, number>)) || [0])}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Token Usage */}
                            <div className="limits-section" style={{ marginTop: 24 }}>
                                <div className="limit-item">
                                    <div className="limit-header">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Cpu size={14} /> Total Tokens Used
                                        </span>
                                        <span>{usageStats.totalTokens.toLocaleString()}</span>
                                    </div>
                                    <div className="limit-footer" style={{ marginTop: 8 }}>
                                        <span>Lifetime usage</span>
                                        <span>Self-hosted (no limits)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Activity Graph */}
                            <div className="activity-section" style={{ marginTop: 24 }}>
                                <div className="activity-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="stat-label" style={{ fontSize: '1rem', fontWeight: 600, color: '#e0e0e0' }}>Activity</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 0, background: '#1B1913', padding: 2, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                                        {['7d', '30d', '12m'].map((range) => (
                                            <button
                                                key={range}
                                                onClick={() => setGraphRange(range as any)}
                                                style={{
                                                    padding: '4px 12px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: 6,
                                                    background: graphRange === range ? '#FFE4C4' : 'transparent',
                                                    color: graphRange === range ? '#000' : '#888',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {range}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div
                                    ref={graphContainerRef}
                                    style={{
                                        minHeight: 380,
                                        width: '100%',
                                        position: 'relative',
                                        background: 'linear-gradient(180deg, rgba(255,228,196,0.04) 0%, rgba(0,0,0,0) 100%), linear-gradient(180deg, #1B1913 0%, #14120B 100%)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 18,
                                        padding: 'clamp(12px, 1.5vw, 18px)',
                                        paddingTop: 'clamp(24px, 2.5vw, 36px)',
                                        boxSizing: 'border-box',
                                        overflow: 'visible',
                                        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
                                        minWidth: 0 // Allow flex shrinking
                                    }}
                                >
                                    {(() => {
                                        const data = usageStats.activityData
                                        const rawValues = data.map(d => d.value)

                                        // Use raw values directly - no smoothing needed for accurate representation
                                        const maxValue = Math.max(...rawValues, 1)
                                        const max = maxValue * 1.15
                                        const width = graphDimensions.width
                                        const height = graphDimensions.height
                                        // Responsive padding based on width
                                        const paddingX = Math.max(20, Math.min(28, width * 0.025))
                                        const paddingY = Math.max(18, Math.min(22, height * 0.07))

                                        // Direct coordinate calculation from data points
                                        const getCoords = (val: number, idx: number) => {
                                            const x = paddingX + (idx / Math.max(1, data.length - 1)) * (width - 2 * paddingX)
                                            const y = height - paddingY - (Math.max(0, val) / max) * (height - 2 * paddingY)
                                            return { x, y }
                                        }

                                        // Build smooth path using quadratic Bezier curves through actual data points
                                        let lineD = ''
                                        let areaD = ''

                                        if (data.length > 0) {
                                            const points = rawValues.map((v, i) => getCoords(v, i))

                                            // Start the path
                                            lineD = `M ${points[0].x} ${points[0].y}`

                                            if (points.length === 1) {
                                                // Single point - just a dot, extend as a line
                                                lineD = `M ${paddingX} ${points[0].y} L ${width - paddingX} ${points[0].y}`
                                            } else if (points.length === 2) {
                                                // Two points - simple line
                                                lineD = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
                                            } else {
                                                // Multiple points - use smooth quadratic curves
                                                for (let i = 1; i < points.length; i++) {
                                                    const prev = points[i - 1]
                                                    const curr = points[i]

                                                    // Use midpoint control for smooth curve
                                                    const midX = (prev.x + curr.x) / 2
                                                    const midY = (prev.y + curr.y) / 2

                                                    if (i === 1) {
                                                        // First segment: quadratic to midpoint
                                                        lineD += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`
                                                    } else if (i === points.length - 1) {
                                                        // Last segment: curve through to final point
                                                        lineD += ` Q ${prev.x} ${prev.y} ${curr.x} ${curr.y}`
                                                    } else {
                                                        // Middle segments: smooth through midpoints
                                                        lineD += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`
                                                    }
                                                }
                                            }

                                            // Create area path by closing to bottom
                                            const lastPoint = points[points.length - 1]
                                            const firstPoint = points[0]
                                            areaD = `${lineD} L ${lastPoint.x} ${height - paddingY} L ${firstPoint.x} ${height - paddingY} Z`
                                        }

                                        // Y Axis Labels - use nice rounded numbers (reversed so max at top, 0 at bottom)
                                        const yLabels = [Math.round(max), Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0]
                                        const xLabelInterval = graphRange === '30d' ? 3 : graphRange === '12m' ? 2 : 1
                                        // Responsive font size for X-axis labels
                                        const xAxisFontSize = Math.max(10, Math.min(12, width * 0.011))

                                        return (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'visible', minWidth: 0 }}>
                                                <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'visible', minWidth: 0 }}>
                                                    {/* Y-Axis - aligned with graph padding */}
                                                    <div style={{
                                                        position: 'relative',
                                                        paddingRight: Math.max(8, Math.min(10, width * 0.009)),
                                                        height: '100%',
                                                        color: '#999999',
                                                        fontSize: 'clamp(0.65rem, 0.7vw, 0.75rem)',
                                                        width: Math.max(35, Math.min(50, width * 0.045)),
                                                        textAlign: 'right',
                                                        boxSizing: 'border-box',
                                                        flexShrink: 0
                                                    }}>
                                                        {yLabels.map((v, i) => {
                                                            // Calculate the exact Y position to match the grid line
                                                            // Grid line formula: height - paddingY - (i / 4) * (height - 2 * paddingY)
                                                            // This gives us the SVG Y coordinate
                                                            const graphHeight = height - 2 * paddingY
                                                            const svgY = height - paddingY - (i / 4) * graphHeight
                                                            // Convert SVG Y coordinate (0 at top, height at bottom) to percentage
                                                            // Since the container matches the SVG height, we can use percentage directly
                                                            const labelYPercent = (svgY / height) * 100

                                                            return (
                                                                <div
                                                                    key={i}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        top: `${labelYPercent}%`,
                                                                        right: 0,
                                                                        transform: 'translateY(-50%)',
                                                                        lineHeight: 1,
                                                                        whiteSpace: 'nowrap'
                                                                    }}
                                                                >
                                                                    {v}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>

                                                    <div style={{ flex: 1, position: 'relative', overflow: 'visible', minWidth: 0, minHeight: 200, maxHeight: 400 }}>
                                                        <svg
                                                            viewBox={`0 0 ${width} ${height}`}
                                                            preserveAspectRatio="xMidYMid meet"
                                                            style={{ width: '100%', height: '100%', overflow: 'visible', minWidth: 0, display: 'block', maxHeight: '100%' }}
                                                            ref={(svgEl) => {
                                                                if (svgEl && hoverX !== null && data.length > 0) {
                                                                    // Store SVG ref for path point calculation
                                                                    (svgEl as any).__pathRef = lineD
                                                                }
                                                            }}
                                                        >
                                                            <defs>
                                                                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="0%" stopColor="#FFE4C4" stopOpacity="0.4" />
                                                                    <stop offset="100%" stopColor="#FFE4C4" stopOpacity="0" />
                                                                </linearGradient>
                                                            </defs>

                                                            {/* Horizontal Grid lines */}
                                                            {yLabels.map((_, i) => (
                                                                <line
                                                                    key={i}
                                                                    x1={paddingX}
                                                                    y1={height - paddingY - (i / 4) * (height - 2 * paddingY)}
                                                                    x2={width - paddingX}
                                                                    y2={height - paddingY - (i / 4) * (height - 2 * paddingY)}
                                                                    stroke="#1a1a1a"
                                                                    strokeWidth="1.5"
                                                                />
                                                            ))}

                                                            {/* Vertical Grid lines */}
                                                            {data.length > 1 && data.map((_, i) => {
                                                                const showLine = graphRange === '30d' ? i % xLabelInterval === 0 || i === data.length - 1 : true
                                                                if (!showLine) return null
                                                                const x = paddingX + (i / (data.length - 1)) * (width - 2 * paddingX)
                                                                return (
                                                                    <line
                                                                        key={`x-${i}`}
                                                                        x1={x}
                                                                        y1={paddingY}
                                                                        x2={x}
                                                                        y2={height - paddingY}
                                                                        stroke="#151515"
                                                                        strokeWidth="1"
                                                                        opacity={i === 0 || i === data.length - 1 ? 0.25 : 0.14}
                                                                        strokeDasharray={graphRange === '30d' ? '2 6' : 'none'}
                                                                    />
                                                                )
                                                            })}

                                                            {/* Area & Line Animated */}
                                                            <motion.path
                                                                d={areaD}
                                                                fill="url(#chartGradient)"
                                                                stroke="none"
                                                                initial={false}
                                                                animate={{ d: areaD }}
                                                                transition={{ duration: 0.4, ease: "easeInOut" }}
                                                            />
                                                            <motion.path
                                                                ref={pathRef}
                                                                d={lineD}
                                                                fill="none"
                                                                stroke="#FFE4C4"
                                                                strokeWidth="3"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                initial={false}
                                                                animate={{ d: lineD }}
                                                                transition={{ duration: 0.4, ease: "easeInOut" }}
                                                            />

                                                            {/* Smooth cursor-following interaction */}
                                                            {(() => {
                                                                // Calculate hovered position and interpolated value
                                                                if (hoverX !== null && data.length > 0) {
                                                                    // Map hoverX (0-1) to data index (continuous)
                                                                    const continuousIndex = hoverX * (data.length - 1)
                                                                    const indexFloor = Math.floor(continuousIndex)
                                                                    const indexCeil = Math.min(data.length - 1, Math.ceil(continuousIndex))
                                                                    const t = continuousIndex - indexFloor

                                                                    // Get display value (nearest data point)
                                                                    const nearestIndex = Math.round(continuousIndex)
                                                                    const nearestData = data[nearestIndex]

                                                                    // Calculate pixel positions
                                                                    const cursorX = paddingX + hoverX * (width - 2 * paddingX)

                                                                    // Calculate actual Y position on the curve path
                                                                    // Try to use path element's getPointAtLength for accuracy
                                                                    let cursorY = height - paddingY

                                                                    if (pathRef.current && lineD) {
                                                                        try {
                                                                            const pathLength = pathRef.current.getTotalLength()
                                                                            // Estimate the length along path that corresponds to cursorX
                                                                            // Use binary search to find the point with matching X
                                                                            let minLength = 0
                                                                            let maxLength = pathLength
                                                                            let bestPoint = pathRef.current.getPointAtLength(0)
                                                                            let bestDistance = Math.abs(bestPoint.x - cursorX)

                                                                            // Binary search for closest point
                                                                            for (let i = 0; i < 20; i++) {
                                                                                const testLength = (minLength + maxLength) / 2
                                                                                const testPoint = pathRef.current.getPointAtLength(testLength)
                                                                                const distance = Math.abs(testPoint.x - cursorX)

                                                                                if (distance < bestDistance) {
                                                                                    bestDistance = distance
                                                                                    bestPoint = testPoint
                                                                                }

                                                                                if (testPoint.x < cursorX) {
                                                                                    minLength = testLength
                                                                                } else {
                                                                                    maxLength = testLength
                                                                                }
                                                                            }

                                                                            cursorY = bestPoint.y
                                                                        } catch (e) {
                                                                            // Fallback to calculation method
                                                                            const points = rawValues.map((v, i) => getCoords(v, i))
                                                                            if (data.length === 1) {
                                                                                cursorY = points[0].y
                                                                            } else if (data.length === 2) {
                                                                                cursorY = points[0].y + (points[1].y - points[0].y) * hoverX
                                                                            } else {
                                                                                // Find segment and interpolate
                                                                                for (let i = 0; i < points.length - 1; i++) {
                                                                                    const p1 = points[i]
                                                                                    const p2 = points[i + 1]
                                                                                    if (cursorX >= p1.x && cursorX <= p2.x) {
                                                                                        const t = (cursorX - p1.x) / (p2.x - p1.x || 0.001)
                                                                                        cursorY = p1.y + (p2.y - p1.y) * t
                                                                                        break
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    } else {
                                                                        // Fallback: use simple interpolation
                                                                        const points = rawValues.map((v, i) => getCoords(v, i))
                                                                        if (data.length === 1) {
                                                                            cursorY = points[0].y
                                                                        } else if (data.length === 2) {
                                                                            cursorY = points[0].y + (points[1].y - points[0].y) * hoverX
                                                                        } else {
                                                                            // Find segment
                                                                            for (let i = 0; i < points.length - 1; i++) {
                                                                                const p1 = points[i]
                                                                                const p2 = points[i + 1]
                                                                                if (cursorX >= p1.x && cursorX <= p2.x) {
                                                                                    const t = (cursorX - p1.x) / (p2.x - p1.x || 0.001)
                                                                                    cursorY = p1.y + (p2.y - p1.y) * t
                                                                                    break
                                                                                }
                                                                            }
                                                                        }
                                                                    }

                                                                    // Clamp to valid Y range, but allow circle to extend slightly beyond for visibility
                                                                    const circleRadius = 7
                                                                    const circleStroke = 3
                                                                    const totalRadius = circleRadius + circleStroke
                                                                    // Allow circle to be visible even at edges by using a smaller clamp margin
                                                                    cursorY = Math.max(paddingY + circleRadius, Math.min(height - paddingY - circleRadius, cursorY))

                                                                    return (
                                                                        <>
                                                                            {/* Vertical guide line */}
                                                                            <motion.line
                                                                                x1={cursorX}
                                                                                y1={paddingY}
                                                                                x2={cursorX}
                                                                                y2={height - paddingY}
                                                                                stroke="rgba(255,228,196,0.2)"
                                                                                strokeWidth="1"
                                                                                strokeDasharray="4 4"
                                                                                initial={false}
                                                                                animate={{ x1: cursorX, x2: cursorX }}
                                                                                transition={{ duration: 0.05 }}
                                                                            />
                                                                            {/* Cursor-following point */}
                                                                            <motion.circle
                                                                                r={7}
                                                                                fill="#FFE4C4"
                                                                                stroke="#14120B"
                                                                                strokeWidth="3"
                                                                                initial={false}
                                                                                animate={{ cx: cursorX, cy: cursorY }}
                                                                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                                                                style={{ pointerEvents: 'none' }}
                                                                            />
                                                                        </>
                                                                    )
                                                                }
                                                                return null
                                                            })()}

                                                            {/* Invisible interaction layer - covers entire SVG */}
                                                            <rect
                                                                x={0}
                                                                y={0}
                                                                width={width}
                                                                height={height}
                                                                fill="transparent"
                                                                style={{ cursor: 'crosshair' }}
                                                                onMouseMove={(e) => {
                                                                    const svg = e.currentTarget.ownerSVGElement
                                                                    if (!svg) return
                                                                    const svgRect = svg.getBoundingClientRect()
                                                                    // Calculate position relative to SVG viewBox coordinates
                                                                    const mouseX = ((e.clientX - svgRect.left) / svgRect.width) * width
                                                                    // Convert to 0-1 range within the graph area (accounting for padding)
                                                                    const graphX = (mouseX - paddingX) / (width - 2 * paddingX)
                                                                    // Store pixel position relative to container for tooltip
                                                                    const pixelX = e.clientX - svgRect.left
                                                                    const pixelY = e.clientY - svgRect.top
                                                                    // Clamp to valid range
                                                                    if (graphX >= 0 && graphX <= 1) {
                                                                        setHoverX(graphX)
                                                                        setMousePos({ x: pixelX, y: pixelY })
                                                                    } else {
                                                                        setHoverX(null)
                                                                        setMousePos(null)
                                                                    }
                                                                }}
                                                                onMouseLeave={() => { setHoverX(null); setMousePos(null) }}
                                                            />
                                                        </svg>

                                                        {/* Floating Tooltip */}
                                                        {hoverX !== null && mousePos && data.length > 0 && (() => {
                                                            // Calculate nearest data point for tooltip
                                                            const continuousIndex = hoverX * (data.length - 1)
                                                            const nearestIndex = Math.round(continuousIndex)
                                                            const nearestData = data[nearestIndex]

                                                            if (!nearestData) return null

                                                            return (
                                                                <motion.div
                                                                    initial={false}
                                                                    animate={{
                                                                        x: mousePos.x,
                                                                        y: mousePos.y - 60,
                                                                    }}
                                                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        left: 0,
                                                                        top: 0,
                                                                        transform: 'translate(-50%, -100%)',
                                                                        background: 'rgba(20,20,20,0.95)',
                                                                        border: '1px solid #333',
                                                                        borderRadius: 10,
                                                                        padding: '10px 14px',
                                                                        minWidth: 80,
                                                                        zIndex: 10,
                                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                                                        pointerEvents: 'none',
                                                                        backdropFilter: 'blur(8px)'
                                                                    }}>
                                                                    <div style={{ color: '#FFE4C4', fontSize: '1rem', fontWeight: 700, marginBottom: 2, textAlign: 'center' }}>
                                                                        {nearestData.value}
                                                                    </div>
                                                                    <div style={{ color: '#888', fontSize: 'clamp(0.65rem, 0.8vw, 0.75rem)', textAlign: 'center' }}>
                                                                        {nearestData.label}
                                                                    </div>
                                                                </motion.div>
                                                            )
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* X-Axis Labels - Show All */}
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    paddingLeft: paddingX,
                                                    paddingRight: paddingX,
                                                    marginTop: 12,
                                                    color: '#999999',
                                                    fontSize: `clamp(0.65rem, ${xAxisFontSize}px, 0.75rem)`,
                                                    minWidth: 0,
                                                    overflow: 'hidden'
                                                }}>
                                                    {data.map((d, i) => {
                                                        const showLabel = graphRange === '30d' ? i % xLabelInterval === 0 || i === data.length - 1 : true
                                                        return (
                                                            <div
                                                                key={i}
                                                                style={{
                                                                    width: `${100 / data.length}%`,
                                                                    textAlign: 'center',
                                                                    opacity: showLabel ? 0.85 : 0.2,
                                                                    minWidth: 0,
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                                title={d.label}
                                                            >
                                                                {showLabel ? d.label : ''}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== API KEYS SECTION ========== */}
                    {activeSection === 'preferences' && (
                        <div style={{ padding: '40px', paddingBottom: 100 }}>
                            <div className="page-header">
                                <h2 className="page-title">API Keys</h2>
                                <div className="page-subtitle">Configure your API credentials for each provider</div>
                            </div>

                            {/* API Keys Section */}
                            <div className="settings-section-card">
                                <h3 className="section-head">Provider Credentials</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {/* OpenRouter */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>OpenRouter API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showOpenRouterKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.openRouterApiKey}
                                                onChange={e => handleChange({ openRouterApiKey: e.target.value })}
                                                placeholder="sk-or-..."
                                            />
                                            <button onClick={() => setShowOpenRouterKey(!showOpenRouterKey)} style={{ padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showOpenRouterKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Perplexity */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Perplexity API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showPerplexityKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.perplexityApiKey}
                                                onChange={e => handleChange({ perplexityApiKey: e.target.value })}
                                                placeholder="pplx-..."
                                            />
                                            <button onClick={() => setShowPerplexityKey(!showPerplexityKey)} style={{ padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showPerplexityKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Gemini */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Gemini API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showGeminiKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.geminiApiKey}
                                                onChange={e => handleChange({ geminiApiKey: e.target.value })}
                                                placeholder="AIza..."
                                            />
                                            <button onClick={() => setShowGeminiKey(!showGeminiKey)} style={{ padding: '0 12px', background: '#222', border: '1px solid #333', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Groq */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Groq API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showGroqKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.groqApiKey}
                                                onChange={e => handleChange({ groqApiKey: e.target.value })}
                                                placeholder="gsk_..."
                                            />
                                            <button onClick={() => setShowGroqKey(!showGroqKey)} style={{ padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showGroqKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Codex (ChatGPT OAuth) */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Codex (ChatGPT Plus/Pro)</label>
                                        <CodexAuthSection />
                                    </div>

                                    {/* Ollama */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Ollama URL</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                className="setting-input-scira"
                                                value={pendingSettings.ollamaUrl}
                                                onChange={e => handleChange({ ollamaUrl: e.target.value })}
                                                placeholder="http://localhost:11434"
                                            />
                                            <button onClick={checkOllama} style={{ padding: '0 16px', background: isOllamaConnected ? '#1a3a1a' : 'rgba(255,255,255,0.04)', border: `1px solid ${isOllamaConnected ? '#22c55e' : 'rgba(255,255,255,0.08)'}`, color: isOllamaConnected ? '#22c55e' : '#fff', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                {isCheckingOllama ? '...' : (isOllamaConnected ? '✓ Connected' : 'Check')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* System Prompt */}
                            <div className="settings-section-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h3 className="section-head" style={{ margin: 0 }}>System Prompt</h3>
                                    <button onClick={resetSystemPrompt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#888', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        <RotateCcw size={12} /> Reset
                                    </button>
                                </div>
                                <textarea
                                    className="setting-input-scira"
                                    value={pendingSettings.systemPrompt}
                                    onChange={e => handleChange({ systemPrompt: e.target.value })}
                                    style={{ minHeight: 200, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.7 }}
                                    placeholder="Enter the system prompt for the AI..."
                                />
                            </div>

                            {/* Title Generation Model */}
                            <div className="settings-section-card">
                                <h3 className="section-head">Title Generation</h3>
                                <div style={{ marginBottom: 12 }}>
                                    <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Model for generating chat titles</label>
                                    <CustomModelSelect
                                        value={pendingSettings.titleModel}
                                        onChange={(value) => handleChange({ titleModel: value })}
                                        geminiModels={pendingSettings.geminiModels || []}
                                        groqModels={pendingSettings.groqModels || []}
                                        openRouterModels={pendingSettings.configuredModels || []}
                                        perplexityModels={pendingSettings.perplexityModels || []}
                                        ollamaModels={pendingSettings.ollamaModels || []}
                                    />
                                    <div style={{ color: '#999999', fontSize: '0.8rem', marginTop: 8 }}>
                                        Recommended: Fast models like Gemini 2.0 Flash or Groq Llama 3.1 8B
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== TOOLS SECTION ========== */}
                    {activeSection === 'tools' && (
                        <div style={{ padding: '40px' }}>
                            <div className="page-header">
                                <h2 className="page-title">AI Tools</h2>
                                <div className="page-subtitle">Enable and configure AI function calling tools</div>
                            </div>

                            {/* Tools Toggle */}
                            <div className="settings-section-card">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <div>
                                        <h3 className="section-head">Enable Tools</h3>
                                        <div className="section-desc">Allow AI to use tools like web search, calculator, and more</div>
                                    </div>
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={pendingSettings.toolsEnabled ?? settings.toolsEnabled}
                                            onChange={(e) => handleChange({ toolsEnabled: e.target.checked })}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>

                                {pendingSettings.toolsEnabled !== false && (
                                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <h3 className="section-head" style={{ marginBottom: '16px' }}>Web Search API</h3>
                                        <div className="section-desc" style={{ marginBottom: '12px' }}>
                                            Get your Tavily key at{' '}
                                            <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>
                                                tavily.com
                                            </a>
                                        </div>
                                        <input
                                            type="password"
                                            className="setting-input-scira"
                                            placeholder="tvly-..."
                                            value={pendingSettings.tavilyApiKey ?? settings.tavilyApiKey}
                                            onChange={(e) => handleChange({ tavilyApiKey: e.target.value })}
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* MCP Servers */}
                            <div className="settings-section-card">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                                    <div>
                                        <h3 className="section-head">MCP Servers</h3>
                                        <div className="section-desc">Connect custom MCP servers and expose their tools to Zura</div>
                                    </div>
                                    <button
                                        onClick={() => refreshMcpTools()}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '6px 12px',
                                            background: 'transparent',
                                            border: '1px solid #333',
                                            borderRadius: 6,
                                            color: '#888',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem'
                                        }}
                                    >
                                        <RefreshCw size={12} /> Refresh
                                    </button>
                                </div>

                                {(pendingSettings.mcpServers || []).length === 0 && (
                                    <div style={{ color: '#888', fontSize: '0.85rem', padding: '12px 0' }}>
                                        No MCP servers configured yet.
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {(pendingSettings.mcpServers || []).map((server) => {
                                        const status = mcpServerStatuses.find(item => item.id === server.id)
                                        const statusLabel = !server.enabled
                                            ? 'disabled'
                                            : status?.status || 'unknown'
                                        const statusColor = statusLabel === 'ready'
                                            ? '#22c55e'
                                            : statusLabel === 'error'
                                                ? '#ef4444'
                                                : '#9ca3af'

                                        return (
                                            <div
                                                key={server.id}
                                                style={{
                                                    padding: 16,
                                                    borderRadius: 12,
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                    background: 'rgba(255,255,255,0.02)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 12
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                                    <input
                                                        className="setting-input-scira"
                                                        placeholder="Server name"
                                                        value={server.name}
                                                        onChange={(e) => updateMcpServer(server.id, { name: e.target.value })}
                                                        style={{ flex: 1, minWidth: 180 }}
                                                    />
                                                    <span style={{ fontSize: '0.8rem', color: statusColor }}>
                                                        {statusLabel}
                                                    </span>
                                                    <label className="toggle-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={server.enabled}
                                                            onChange={(e) => updateMcpServer(server.id, { enabled: e.target.checked })}
                                                        />
                                                        <span className="toggle-slider"></span>
                                                    </label>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                                    <div>
                                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Transport</label>
                                                        <select
                                                            className="setting-input-scira"
                                                            value={server.transport}
                                                            onChange={(e) => updateMcpServer(server.id, { transport: e.target.value as McpServerConfig['transport'] })}
                                                        >
                                                            <option value="stdio">Stdio</option>
                                                            <option value="http">HTTP</option>
                                                        </select>
                                                    </div>

                                                    {server.transport === 'stdio' ? (
                                                        <>
                                                            <div>
                                                                <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Command</label>
                                                                <input
                                                                    className="setting-input-scira"
                                                                    placeholder="npx"
                                                                    value={server.command || ''}
                                                                    onChange={(e) => updateMcpServer(server.id, { command: e.target.value })}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Args (space separated)</label>
                                                                <input
                                                                    className="setting-input-scira"
                                                                    placeholder="-y @modelcontextprotocol/server-filesystem"
                                                                    value={server.args || ''}
                                                                    onChange={(e) => updateMcpServer(server.id, { args: e.target.value })}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Working Directory</label>
                                                                <input
                                                                    className="setting-input-scira"
                                                                    placeholder="Optional cwd"
                                                                    value={server.cwd || ''}
                                                                    onChange={(e) => updateMcpServer(server.id, { cwd: e.target.value })}
                                                                />
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div>
                                                            <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Server URL</label>
                                                            <input
                                                                className="setting-input-scira"
                                                                placeholder="https://example.com/mcp"
                                                                value={server.url || ''}
                                                                onChange={(e) => updateMcpServer(server.id, { url: e.target.value })}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {server.transport === 'stdio' && (
                                                    <div>
                                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Environment (KEY=VALUE per line)</label>
                                                        <textarea
                                                            className="setting-input-scira"
                                                            placeholder="API_KEY=..."
                                                            value={server.env || ''}
                                                            onChange={(e) => updateMcpServer(server.id, { env: e.target.value })}
                                                            style={{ minHeight: 80, resize: 'vertical' }}
                                                        />
                                                    </div>
                                                )}

                                                {server.transport === 'http' && (
                                                    <div>
                                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Headers (Header: Value per line)</label>
                                                        <textarea
                                                            className="setting-input-scira"
                                                            placeholder="Authorization: Bearer ..."
                                                            value={server.headers || ''}
                                                            onChange={(e) => updateMcpServer(server.id, { headers: e.target.value })}
                                                            style={{ minHeight: 80, resize: 'vertical' }}
                                                        />
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b0b0b0', fontSize: '0.85rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={server.requiresApproval || false}
                                                            onChange={(e) => updateMcpServer(server.id, { requiresApproval: e.target.checked })}
                                                        />
                                                        Require approval for this server
                                                    </label>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{ color: '#888', fontSize: '0.8rem' }}>Timeout (ms)</span>
                                                        <input
                                                            className="setting-input-scira"
                                                            type="number"
                                                            min={1000}
                                                            value={server.timeoutMs || 30000}
                                                            onChange={(e) => updateMcpServer(server.id, { timeoutMs: Number(e.target.value) })}
                                                            style={{ width: 110 }}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => removeMcpServer(server.id)}
                                                        style={{
                                                            padding: '8px 12px',
                                                            background: 'rgba(239, 68, 68, 0.12)',
                                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                                            color: '#f87171',
                                                            borderRadius: 8,
                                                            cursor: 'pointer',
                                                            fontSize: '0.8rem'
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                {status?.error && (
                                                    <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>
                                                        {status.error}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <button
                                        onClick={addMcpServer}
                                        style={{
                                            padding: '10px 16px',
                                            background: 'rgba(59, 130, 246, 0.15)',
                                            border: '1px solid rgba(59, 130, 246, 0.35)',
                                            borderRadius: 10,
                                            color: '#93c5fd',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8
                                        }}
                                    >
                                        <Plus size={14} /> Add MCP Server
                                    </button>
                                    <div style={{ color: '#888', fontSize: '0.8rem' }}>
                                        {mcpTools.length > 0 ? `${mcpTools.length} MCP tool(s) available` : 'No MCP tools loaded'}
                                    </div>
                                </div>
                            </div>

                            {/* Available Tools List */}
                            {pendingSettings.toolsEnabled !== false && (
                                <div className="settings-section-card">
                                    <h3 className="section-head">Available Tools</h3>
                                    <div className="section-desc" style={{ marginBottom: '16px' }}>
                                        {pendingSettings.enabledTools && pendingSettings.enabledTools.length > 0
                                            ? `${enabledToolNames.size} tool(s) enabled`
                                            : 'All tools enabled'}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                                        {allToolDefinitions.map((tool) => {
                                            const isEnabled = enabledToolNames.has(tool.name)
                                            const displayName = formatToolDisplayName(tool.name)
                                            let icon = <Box size={18} />

                                            if (isMcpToolName(tool.name)) {
                                                icon = <Plug size={18} />
                                            } else if (tool.name === 'web_search') {
                                                icon = <Search size={18} />
                                            } else if (tool.name === 'fetch_url') {
                                                icon = <Globe size={18} />
                                            } else if (tool.name === 'calculator') {
                                                icon = <Calculator size={18} />
                                            } else if (tool.name === 'get_datetime') {
                                                icon = <Clock size={18} />
                                            } else if (tool.name === 'read_clipboard' || tool.name === 'write_clipboard') {
                                                icon = <Clipboard size={18} />
                                            }

                                            return (
                                                <div
                                                    key={tool.name}
                                                    style={{
                                                        padding: '12px',
                                                        borderRadius: '8px',
                                                        border: '1px solid rgba(255,255,255,0.06)',
                                                        background: 'rgba(255,255,255,0.02)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px',
                                                        opacity: isEnabled ? 1 : 0.5
                                                    }}
                                                >
                                                    <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#e0e0e0' }}>
                                                            {displayName}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#888' }}>{tool.description}</div>
                                                    </div>
                                                    {!isEnabled && (
                                                        <span style={{ fontSize: '0.7rem', color: '#777' }}>Disabled</span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========== MODELS SECTION ========== */}
                    {activeSection === 'models' && (
                        <div style={{ padding: '40px' }}>
                            <div className="page-header">
                                <h2 className="page-title">Models</h2>
                                <div className="page-subtitle">Configure your AI model catalog</div>
                            </div>

                            <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* OpenRouter Models */}
                                {(pendingSettings.configuredModels || []).length > 0 && (
                                    <div className="settings-section-card" style={{ background: '#1B1913', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 0, overflow: 'hidden' }}>
                                        {/* Header */}
                                        <div
                                            onClick={() => toggleModelGroup('openrouter')}
                                            style={{
                                                padding: '16px 20px',
                                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <ProviderLogo provider="openrouter" size={18} />
                                                <div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e0e0' }}>OpenRouter</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#999999', marginTop: '2px' }}>{(pendingSettings.configuredModels || []).length} Models</div>
                                                </div>
                                            </div>
                                            <ChevronDown size={16} style={{ transform: collapsedModelGroups.openrouter ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#999' }} />
                                        </div>

                                        {/* Model List */}
                                        {!collapsedModelGroups.openrouter && (
                                            <div style={{ padding: '8px' }}>
                                                {(pendingSettings.configuredModels || []).map((model: any, index: number) => {
                                                    const { icon, color } = getModelAttributes(model, 'openrouter')
                                                    return (
                                                        <div
                                                            key={index}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '12px',
                                                                padding: '10px 12px',
                                                                borderRadius: '8px',
                                                                marginBottom: '4px',
                                                                transition: 'all 0.15s'
                                                            }}
                                                            onMouseEnter={e => {
                                                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                                            }}
                                                            onMouseLeave={e => {
                                                                e.currentTarget.style.background = 'transparent'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
                                                                {React.cloneElement(icon as React.ReactElement, { size: 18 })}
                                                            </div>
                                                            {editingIndex === index ? (
                                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                                        <input value={editCode} onChange={e => setEditCode(e.target.value)} className="setting-input-scira" style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }} placeholder="Code" />
                                                                        <input value={editName} onChange={e => setEditName(e.target.value)} className="setting-input-scira" style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }} placeholder="Name" />
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                                        <button onClick={saveEdit} style={{ flex: 1, padding: '6px', background: '#1a3a1a', border: '1px solid #22c55e', color: '#22c55e', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                                                                        <button onClick={() => setEditingIndex(null)} style={{ flex: 1, padding: '6px', background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div style={{ flex: 1 }}>
                                                                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{removeEmojis(model.displayName)}</div>
                                                                        <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>{model.code}</div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                                        <button onClick={(e) => { e.stopPropagation(); startEdit(index) }} style={{ padding: '6px', background: 'transparent', border: 'none', color: '#999999', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e0e0e0' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999999' }}><Edit2 size={14} /></button>
                                                                        <button onClick={(e) => { e.stopPropagation(); deleteModel(index) }} style={{ padding: '6px', background: 'transparent', border: 'none', color: '#999999', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999999' }}><Trash2 size={14} /></button>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}

                                        {/* Add New Model */}
                                        {!collapsedModelGroups.openrouter && (
                                            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                    <Plus size={14} color="#00bcd4" />
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#e0e0e0' }}>Add Custom Model</div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                                                    <input value={newModelCode} onChange={e => setNewModelCode(e.target.value)} className="setting-input-scira" style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', background: '#1B1913', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} placeholder="Model ID" />
                                                    <input value={newModelName} onChange={e => setNewModelName(e.target.value)} className="setting-input-scira" style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem', background: '#1B1913', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} placeholder="Display Name" />
                                                </div>
                                                <button onClick={addModel} style={{ width: '100%', padding: '8px 12px', background: 'linear-gradient(90deg, #00bcd4, #0097a7)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: (!newModelCode || !newModelName) ? 0.5 : 1, pointerEvents: (!newModelCode || !newModelName) ? 'none' : 'auto', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>Add Model to Library</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Perplexity Models */}
                                {(pendingSettings.perplexityModels || []).length > 0 && (
                                    <div className="settings-section-card" style={{ background: '#1B1913', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 0, overflow: 'hidden' }}>
                                        <div onClick={() => toggleModelGroup('perplexity')} style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <ProviderLogo provider="perplexity" size={18} />
                                                <div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e0e0' }}>Perplexity</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#999999', marginTop: '2px' }}>{(pendingSettings.perplexityModels || []).length} Models</div>
                                                </div>
                                            </div>
                                            <ChevronDown size={16} style={{ transform: collapsedModelGroups.perplexity ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#999' }} />
                                        </div>
                                        {!collapsedModelGroups.perplexity && (
                                            <div style={{ padding: '8px' }}>
                                                {(pendingSettings.perplexityModels || []).map((model: any, index: number) => {
                                                    const { icon, color } = getModelAttributes(model, 'perplexity')
                                                    return (
                                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{React.cloneElement(icon as React.ReactElement, { size: 18 })}</div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{removeEmojis(model.displayName)}</div>
                                                                <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>{model.code}</div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Gemini Models */}
                                {(pendingSettings.geminiModels || []).length > 0 && (
                                    <div className="settings-section-card" style={{ background: '#1B1913', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 0, overflow: 'hidden' }}>
                                        <div onClick={() => toggleModelGroup('gemini')} style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <ProviderLogo provider="gemini" size={18} />
                                                <div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e0e0' }}>Gemini</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#999999', marginTop: '2px' }}>{(pendingSettings.geminiModels || []).length} Models</div>
                                                </div>
                                            </div>
                                            <ChevronDown size={16} style={{ transform: collapsedModelGroups.gemini ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#999' }} />
                                        </div>
                                        {!collapsedModelGroups.gemini && (
                                            <div style={{ padding: '8px' }}>
                                                {(pendingSettings.geminiModels || []).map((model: any, index: number) => {
                                                    const { icon, color } = getModelAttributes(model, 'gemini')
                                                    return (
                                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{React.cloneElement(icon as React.ReactElement, { size: 18 })}</div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{removeEmojis(model.displayName)}</div>
                                                                <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>{model.code}</div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Groq Models */}
                                {(pendingSettings.groqModels || []).length > 0 && (
                                    <div className="settings-section-card" style={{ background: '#1B1913', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 0, overflow: 'hidden' }}>
                                        <div onClick={() => toggleModelGroup('groq')} style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <ProviderLogo provider="groq" size={18} />
                                                <div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e0e0' }}>Groq</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#999999', marginTop: '2px' }}>{(pendingSettings.groqModels || []).length} Models</div>
                                                </div>
                                            </div>
                                            <ChevronDown size={16} style={{ transform: collapsedModelGroups.groq ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#999' }} />
                                        </div>
                                        {!collapsedModelGroups.groq && (
                                            <div style={{ padding: '8px' }}>
                                                {(pendingSettings.groqModels || []).map((model: any, index: number) => {
                                                    const { icon, color } = getModelAttributes(model, 'groq')
                                                    return (
                                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{React.cloneElement(icon as React.ReactElement, { size: 18 })}</div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{removeEmojis(model.displayName)}</div>
                                                                <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>{model.code}</div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Ollama Models */}
                                {(pendingSettings.ollamaModels || []).length > 0 && (
                                    <div className="settings-section-card" style={{ background: '#1B1913', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 0, overflow: 'hidden' }}>
                                        <div onClick={() => toggleModelGroup('ollama')} style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <ProviderLogo provider="ollama" size={18} />
                                                <div>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e0e0e0' }}>Ollama</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#999999', marginTop: '2px' }}>{(pendingSettings.ollamaModels || []).length} Models</div>
                                                </div>
                                            </div>
                                            <ChevronDown size={16} style={{ transform: collapsedModelGroups.ollama ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#999' }} />
                                        </div>
                                        {!collapsedModelGroups.ollama && (
                                            <div style={{ padding: '8px' }}>
                                                {(pendingSettings.ollamaModels || []).map((model: any, index: number) => {
                                                    const { icon, color } = getModelAttributes(model, 'ollama')
                                                    return (
                                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{React.cloneElement(icon as React.ReactElement, { size: 18 })}</div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{removeEmojis(model.displayName)}</div>
                                                                <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>{model.code}</div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Codex Models - Model selection is done via the Model Switcher in chat, not here */}
                                {/* Removed per user request - models are selected from the model switcher dropdown */}
                            </div>
                        </div>
                    )}

                    {/* ========== END OF SECTIONS ========== */}
                    {false && (
                        <div style={{ padding: '40px', paddingBottom: 100 }}>
                            <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: 18,
                                    background: 'linear-gradient(135deg, rgba(255,228,196,0.15), rgba(255,150,80,0.1))',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                                }}>
                                    <ListTodo size={32} color="#FFE4C4" />
                                </div>
                                <div>
                                    <h2 className="page-title" style={{ margin: 0, fontSize: '2rem', background: 'linear-gradient(to right, #fff, #aaa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Todo List</h2>
                                    <div className="page-subtitle" style={{ fontSize: '1rem', marginTop: 4 }}>Keep track of your tasks</div>
                                </div>
                            </div>

                            {/* Todo Card */}
                            <div className="settings-section-card" style={{ background: '#1B1913', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 0, overflow: 'hidden' }}>
                                {/* Header */}
                                <div style={{
                                    padding: '20px 24px',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    background: 'linear-gradient(to right, rgba(255,228,196,0.05), transparent)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFE4C4' }} />
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e0e0e0' }}>Your Tasks</h3>
                                            <div style={{ fontSize: '0.8rem', color: '#999999' }}>Add, complete, and manage your todos</div>
                                        </div>
                                    </div>
                                    {pendingSettings.todos && pendingSettings.todos.length > 0 && (
                                        <div style={{ padding: '6px 12px', background: 'rgba(255,228,196,0.1)', borderRadius: 20, color: '#FFE4C4', fontSize: '0.85rem', fontWeight: 500 }}>
                                            {pendingSettings.todos.filter((t: TodoItem) => !t.completed).length} Active
                                        </div>
                                    )}
                                </div>

                                {/* Add Todo Input */}
                                <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <input
                                            type="text"
                                            className="setting-input-scira"
                                            placeholder="What needs to be done?"
                                            value={newModelCode}
                                            onChange={e => setNewModelCode(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && newModelCode.trim()) {
                                                    const newTodo: TodoItem = {
                                                        id: Date.now().toString(),
                                                        text: newModelCode.trim(),
                                                        completed: false,
                                                        createdAt: Date.now()
                                                    }
                                                    handleChange({ todos: [...(pendingSettings.todos || []), newTodo] })
                                                    setNewModelCode('')
                                                }
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            onClick={() => {
                                                if (newModelCode.trim()) {
                                                    const newTodo: TodoItem = {
                                                        id: Date.now().toString(),
                                                        text: newModelCode.trim(),
                                                        completed: false,
                                                        createdAt: Date.now()
                                                    }
                                                    handleChange({ todos: [...(pendingSettings.todos || []), newTodo] })
                                                    setNewModelCode('')
                                                }
                                            }}
                                            style={{
                                                padding: '12px 20px',
                                                background: 'rgba(255,228,196,0.15)',
                                                border: '1px solid rgba(255,228,196,0.3)',
                                                borderRadius: 12,
                                                color: '#FFE4C4',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = 'rgba(255,228,196,0.25)'
                                                e.currentTarget.style.transform = 'translateY(-1px)'
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = 'rgba(255,228,196,0.15)'
                                                e.currentTarget.style.transform = 'translateY(0)'
                                            }}
                                        >
                                            <Plus size={18} />
                                            Add
                                        </button>
                                    </div>
                                </div>

                                {/* Todo List */}
                                {(!pendingSettings.todos || pendingSettings.todos.length === 0) ? (
                                    <div style={{ padding: 48, textAlign: 'center', color: '#888888' }}>
                                        <ListTodo size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                                        <div style={{ fontSize: '1rem', marginBottom: 8, color: '#888' }}>No todos yet</div>
                                        <div style={{ fontSize: '0.85rem', color: '#999999' }}>Add your first task above to get started</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {pendingSettings.todos.map((todo: TodoItem, index: number) => (
                                            <motion.div
                                                key={todo.id}
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 16,
                                                    padding: '16px 24px',
                                                    borderBottom: index < pendingSettings.todos.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                                    background: todo.completed ? 'rgba(255,255,255,0.02)' : 'transparent',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <button
                                                    onClick={() => {
                                                        const updated = pendingSettings.todos.map((t: TodoItem) =>
                                                            t.id === todo.id ? { ...t, completed: !t.completed } : t
                                                        )
                                                        handleChange({ todos: updated })
                                                    }}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: 4,
                                                        borderRadius: 6,
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {todo.completed ? (
                                                        <CheckSquare size={20} color="#FFE4C4" />
                                                    ) : (
                                                        <Square size={20} color="#555" />
                                                    )}
                                                </button>
                                                <span style={{
                                                    flex: 1,
                                                    fontSize: '0.95rem',
                                                    color: todo.completed ? '#555' : '#e0e0e0',
                                                    textDecoration: todo.completed ? 'line-through' : 'none',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    {todo.text}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        const updated = pendingSettings.todos.filter((t: TodoItem) => t.id !== todo.id)
                                                        handleChange({ todos: updated })
                                                    }}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: 8,
                                                        borderRadius: 8,
                                                        color: '#777777',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.color = '#ff6b6b'
                                                        e.currentTarget.style.background = 'rgba(255,107,107,0.1)'
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.color = '#444'
                                                        e.currentTarget.style.background = 'none'
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                {/* Footer Stats */}
                                {pendingSettings.todos && pendingSettings.todos.length > 0 && (
                                    <div style={{
                                        padding: '16px 24px',
                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                        display: 'flex',
                                        gap: 16,
                                        justifyContent: 'flex-start',
                                        background: 'rgba(255,255,255,0.02)'
                                    }}>
                                        <div style={{ fontSize: '0.8rem', color: '#999999' }}>
                                            <span style={{ color: '#888', fontWeight: 500 }}>{pendingSettings.todos.filter((t: TodoItem) => !t.completed).length}</span> remaining
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#999999' }}>
                                            <span style={{ color: '#FFE4C4', fontWeight: 500 }}>{pendingSettings.todos.filter((t: TodoItem) => t.completed).length}</span> completed
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Unsaved Changes Bar */}
            {hasChanges && (
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '12px 24px',
                    background: showWarning ? 'rgba(239, 68, 68, 0.95)' : 'rgba(30, 34, 42, 0.98)',
                    backdropFilter: 'blur(12px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 24,
                    borderRadius: 12,
                    border: showWarning ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: showWarning ? '0 8px 32px rgba(239, 68, 68, 0.3)' : '0 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 100,
                    animation: showWarning ? 'shake 0.5s ease' : 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s'
                }}>
                    <span style={{ color: showWarning ? '#fff' : '#a0a0a0', fontSize: '0.9rem', fontWeight: showWarning ? 600 : 400 }}>
                        {showWarning ? 'Save or discard changes first!' : 'Careful — you have unsaved changes!'}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={cancelChanges}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                padding: '6px 12px',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={e => e.currentTarget.style.color = showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280'}
                        >
                            Discard
                        </button>
                        <button
                            onClick={saveChanges}
                            style={{
                                background: showWarning ? '#fff' : '#22c55e',
                                border: 'none',
                                color: showWarning ? '#dc2626' : '#fff',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                padding: '8px 16px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = showWarning ? '#f0f0f0' : '#16a34a'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = showWarning ? '#fff' : '#22c55e'
                            }}
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(-50%) translateX(0); }
                    20%, 60% { transform: translateX(-50%) translateX(-8px); }
                    40%, 80% { transform: translateX(-50%) translateX(8px); }
                }
            `}</style>
        </div>
    )
}
