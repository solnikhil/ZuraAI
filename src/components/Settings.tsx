import React, { useState, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'
import { User, BarChart2, Settings as SettingsIcon, Puzzle, Brain, ChevronRight, LogOut, Plus, Trash2, Edit2, Check, X, ArrowLeft, Activity } from 'lucide-react'

type SettingsSection = 'usage' | 'preferences' | 'models' | 'shortcuts' | 'about'

interface SettingsProps {
    onClose?: () => void
}

export default function Settings({ onClose }: SettingsProps) {
    const { settings, updateSettings, resetSettings } = useSettings()
    const { sessions } = useChatHistory()
    const [pendingSettings, setPendingSettings] = useState(settings)
    const [activeSection, setActiveSection] = useState<SettingsSection>('usage')
    const [showApiKey, setShowApiKey] = useState(false)
    const [usagePeriod, setUsagePeriod] = useState<'7d' | '30d' | '12m'>('7d')

    // Model editing
    const [newModelCode, setNewModelCode] = useState('')
    const [newModelName, setNewModelName] = useState('')
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [editCode, setEditCode] = useState('')
    const [editName, setEditName] = useState('')

    // Ollama
    const [isOllamaConnected, setIsOllamaConnected] = useState(false)
    const [isCheckingOllama, setIsCheckingOllama] = useState(false)

    useEffect(() => {
        setPendingSettings(settings)
    }, [settings])

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
    }, [pendingSettings.modelProvider])

    const handleChange = (changes: Partial<typeof settings>) => {
        setPendingSettings(prev => ({ ...prev, ...changes }))
    }

    const hasChanges = JSON.stringify(pendingSettings) !== JSON.stringify(settings)

    const saveChanges = () => {
        updateSettings(pendingSettings)
    }

    const cancelChanges = () => {
        setPendingSettings(settings)
    }

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

    const navItems = [
        { id: 'usage', label: 'Usage', icon: <BarChart2 size={18} /> },
        { id: 'preferences', label: 'Preferences', icon: <SettingsIcon size={18} /> },
        { id: 'models', label: 'Models', icon: <Puzzle size={18} /> },
        { id: 'shortcuts', label: 'Shortcuts', icon: <Brain size={18} /> },
        { id: 'about', label: 'About', icon: <User size={18} /> }
    ]

    return (
        <div style={{
            display: 'flex',
            height: '100vh',
            background: '#0a0a0a',
            color: '#e0e0e0',
            fontFamily: "'Inter', -apple-system, sans-serif"
        }}>
            {/* Left Panel - Profile & Nav */}
            <div style={{
                width: '280px',
                background: '#0f0f0f',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                padding: '24px 16px'
            }}>
                {/* Back Button */}
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            marginBottom: '20px',
                            borderRadius: '8px'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                        onMouseLeave={e => e.currentTarget.style.color = '#888'}
                    >
                        <ArrowLeft size={18} />
                        Back to Chat
                    </button>
                )}

                {/* Profile Card */}
                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '24px',
                    border: '1px solid rgba(255,255,255,0.06)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <User size={24} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '1rem' }}>User</div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>Local Setup</div>
                        </div>
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        marginTop: '8px'
                    }}>
                        <span style={{ fontSize: '0.85rem', color: '#888' }}>Blur personal info</span>
                        <div style={{
                            width: '36px',
                            height: '20px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                            cursor: 'pointer'
                        }} />
                    </div>
                </div>

                {/* Navigation */}
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id as SettingsSection)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 14px',
                                background: activeSection === item.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                                border: 'none',
                                borderRadius: '10px',
                                color: activeSection === item.id ? '#fff' : '#888',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                transition: 'all 0.15s',
                                width: '100%',
                                textAlign: 'left'
                            }}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div style={{ flex: 1 }} />

                {/* Reset Button */}
                <button
                    onClick={resetSettings}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '10px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        justifyContent: 'center'
                    }}
                >
                    <LogOut size={16} />
                    Reset to Defaults
                </button>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '8px' }}>Settings</h1>
                <p style={{ color: '#666', marginBottom: '32px', fontSize: '0.9rem' }}>Manage your preferences and configuration</p>

                {activeSection === 'preferences' && (
                    <div>
                        {/* Providers Section */}
                        <Section title="Providers">
                            <div style={{
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.06)',
                                overflow: 'hidden'
                            }}>
                                {/* OpenRouter */}
                                <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                        <span style={{ fontSize: '1.2rem' }}>☁️</span>
                                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>OpenRouter</span>
                                        <span style={{ fontSize: '0.75rem', color: '#666' }}>Cloud Models</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type={showApiKey ? 'text' : 'password'}
                                            value={pendingSettings.openRouterApiKey}
                                            onChange={e => handleChange({ openRouterApiKey: e.target.value })}
                                            placeholder="sk-or-..."
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                        <button onClick={() => setShowApiKey(!showApiKey)} style={btnSecondary}>
                                            {showApiKey ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>

                                {/* Perplexity */}
                                <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                        <span style={{ fontSize: '1.2rem' }}>🧠</span>
                                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>Perplexity</span>
                                        <span style={{ fontSize: '0.75rem', color: '#666' }}>Search + AI</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type={showApiKey ? 'text' : 'password'}
                                            value={pendingSettings.perplexityApiKey}
                                            onChange={e => handleChange({ perplexityApiKey: e.target.value })}
                                            placeholder="pplx-..."
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                    </div>
                                </div>

                                {/* Ollama */}
                                <div style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                        <span style={{ fontSize: '1.2rem' }}>💻</span>
                                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>Ollama</span>
                                        <span style={{ fontSize: '0.75rem', color: '#666' }}>Local</span>
                                        <span style={{
                                            marginLeft: 'auto',
                                            fontSize: '0.7rem',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            background: isOllamaConnected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                            color: isOllamaConnected ? '#22c55e' : '#ef4444'
                                        }}>
                                            {isOllamaConnected ? 'Connected' : 'Not connected'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            value={pendingSettings.ollamaUrl}
                                            onChange={e => handleChange({ ollamaUrl: e.target.value })}
                                            placeholder="http://localhost:11434"
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                        <button onClick={checkOllama} disabled={isCheckingOllama} style={btnSecondary}>
                                            {isCheckingOllama ? '...' : 'Refresh'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </Section>

                        {/* System Prompt */}
                        <Section title="System Prompt">
                            <textarea
                                value={pendingSettings.systemPrompt}
                                onChange={e => handleChange({ systemPrompt: e.target.value })}
                                placeholder="You are a helpful AI assistant..."
                                style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                            />
                        </Section>

                        {/* Temperature */}
                        <Section title={`Temperature: ${pendingSettings.temperature}`}>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={pendingSettings.temperature}
                                onChange={e => handleChange({ temperature: parseFloat(e.target.value) })}
                                style={{ width: '100%', accentColor: '#f59e0b' }}
                            />
                        </Section>
                    </div>
                )}

                {activeSection === 'models' && (
                    <div>
                        <Section title="Configured Models (OpenRouter)">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                {(pendingSettings.configuredModels || []).map((model: any, index: number) => (
                                    <div key={model.code} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 16px',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.06)'
                                    }}>
                                        {editingIndex === index ? (
                                            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                                                <input value={editCode} onChange={e => setEditCode(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                                <button onClick={saveEdit} style={{ ...btnSecondary, background: '#22c55e', color: '#fff' }}><Check size={14} /></button>
                                                <button onClick={() => setEditingIndex(null)} style={btnSecondary}><X size={14} /></button>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{model.displayName}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{model.code}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button onClick={() => startEdit(index)} style={btnIcon}><Edit2 size={14} /></button>
                                                    <button onClick={() => deleteModel(index)} style={{ ...btnIcon, color: '#ef4444' }}><Trash2 size={14} /></button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Add New */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    value={newModelCode}
                                    onChange={e => setNewModelCode(e.target.value)}
                                    placeholder="Model code (e.g., openai/gpt-4)"
                                    style={{ ...inputStyle, flex: 1 }}
                                />
                                <input
                                    value={newModelName}
                                    onChange={e => setNewModelName(e.target.value)}
                                    placeholder="Display name"
                                    style={{ ...inputStyle, flex: 1 }}
                                />
                                <button onClick={addModel} disabled={!newModelCode || !newModelName} style={{
                                    ...btnSecondary,
                                    background: newModelCode && newModelName ? '#f59e0b' : 'rgba(255,255,255,0.05)',
                                    color: newModelCode && newModelName ? '#000' : '#666'
                                }}>
                                    <Plus size={16} />
                                </button>
                            </div>
                        </Section>

                        {/* Ollama Models (read-only) */}
                        <Section title="Ollama Models (Auto-detected)">
                            {(pendingSettings.ollamaModels || []).length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {pendingSettings.ollamaModels.map((m: any) => (
                                        <span key={m.code} style={{
                                            padding: '8px 12px',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: '8px',
                                            fontSize: '0.85rem',
                                            color: '#aaa'
                                        }}>{m.displayName}</span>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: '#666', fontSize: '0.85rem' }}>Connect to Ollama to see available models.</p>
                            )}
                        </Section>

                        {/* Perplexity Models (read-only) */}
                        <Section title="Perplexity Models">
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {(pendingSettings.perplexityModels || []).map((m: any) => (
                                    <span key={m.code} style={{
                                        padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        color: '#aaa'
                                    }}>{m.displayName}</span>
                                ))}
                            </div>
                        </Section>
                    </div>
                )}

                {activeSection === 'shortcuts' && (
                    <div>
                        <Section title="Toggle Overlay">
                            <input
                                value={pendingSettings.shortcuts?.toggleOverlay || 'Ctrl+Shift+Z'}
                                readOnly
                                style={{ ...inputStyle, cursor: 'not-allowed', opacity: 0.7 }}
                            />
                            <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '8px' }}>Customization coming soon.</p>
                        </Section>
                    </div>
                )}

                {activeSection === 'about' && (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <h1 style={{
                            fontSize: '3rem',
                            marginBottom: '8px',
                            background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>Zura</h1>
                        <p style={{ color: '#888', marginBottom: '24px' }}>Your AI Desktop Companion</p>
                        <p style={{ color: '#666' }}>Version 1.0.0</p>
                        <p style={{ color: '#666' }}>© 2025 Zura AI</p>
                    </div>
                )}
            </div>

            {/* Save Bar */}
            {hasChanges && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(20, 20, 20, 0.95)',
                    padding: '12px 24px',
                    borderRadius: '50px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    zIndex: 1000,
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(16px)'
                }}>
                    <span style={{ color: '#ccc', fontSize: '0.85rem' }}>Unsaved changes</span>
                    <button onClick={cancelChanges} style={btnSecondary}>Cancel</button>
                    <button onClick={saveChanges} style={{
                        ...btnSecondary,
                        background: '#f59e0b',
                        color: '#000',
                        fontWeight: 600
                    }}>Save</button>
                </div>
            )}
        </div>
    )
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '0.9rem', color: '#888', marginBottom: '12px', fontWeight: 500 }}>{title}</h3>
            {children}
        </div>
    )
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    color: '#e0e0e0',
    fontSize: '0.9rem',
    outline: 'none'
}

const btnSecondary: React.CSSProperties = {
    padding: '10px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
}

const btnIcon: React.CSSProperties = {
    padding: '8px',
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    borderRadius: '6px'
}
