import React, { useState, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'
import './Settings.css'

type SettingsTab = 'general' | 'ai' | 'shortcuts' | 'about'

export default function Settings() {
    const { settings, updateSettings, resetSettings } = useSettings()
    const [pendingSettings, setPendingSettings] = useState(settings)

    // Local state
    const [activeTab, setActiveTab] = useState<SettingsTab>('general')
    const [showApiKey, setShowApiKey] = useState(false)
    const [showModelModal, setShowModelModal] = useState(false)

    // Model editing state
    const [newModelCode, setNewModelCode] = useState('')
    const [newModelName, setNewModelName] = useState('')
    const [editingModelIndex, setEditingModelIndex] = useState<number | null>(null)
    const [editModelCode, setEditModelCode] = useState('')
    const [editModelName, setEditModelName] = useState('')

    // Ollama state
    const [isOllamaConnected, setIsOllamaConnected] = useState(false)
    const [isCheckingOllama, setIsCheckingOllama] = useState(false)
    const [apiTestResult, setApiTestResult] = useState<string | null>(null)

    // Sync pending settings when global settings change
    useEffect(() => {
        setPendingSettings(settings)
    }, [settings])

    // Check Ollama status
    const checkOllama = async () => {
        if (!pendingSettings.ollamaUrl) return

        setIsCheckingOllama(true)
        const connected = await checkOllamaStatus(pendingSettings.ollamaUrl)
        setIsOllamaConnected(connected)

        if (connected) {
            refreshOllamaModels()
        }
        setIsCheckingOllama(false)
    }

    const refreshOllamaModels = async () => {
        const models = await listOllamaModels(pendingSettings.ollamaUrl)
        if (models.length > 0) {
            const formattedModels = models.map(m => ({
                code: m.name,
                displayName: `${m.name} (${m.details.parameter_size})`
            }))
            // Update settings directly so the UI reflects it immediately
            handleSettingChange({ ollamaModels: formattedModels })
        }
    }

    // Auto-refresh Ollama
    useEffect(() => {
        if (pendingSettings.modelProvider === 'ollama') {
            checkOllama()
            // Auto-refresh every 30 seconds
            const interval = setInterval(checkOllama, 30000)
            return () => clearInterval(interval)
        }
    }, [pendingSettings.modelProvider, pendingSettings.ollamaUrl])

    const handleSettingChange = (changes: Partial<typeof settings>) => {
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
            const newModel = { code: newModelCode, displayName: newModelName }
            const updatedModels = [...(pendingSettings.configuredModels || []), newModel]
            handleSettingChange({
                configuredModels: updatedModels,
                aiModel: newModelCode
            })
            setNewModelCode('')
            setNewModelName('')
        }
    }

    const startEditModel = (index: number) => {
        const model = pendingSettings.configuredModels[index]
        setEditingModelIndex(index)
        setEditModelCode(model.code)
        setEditModelName(model.displayName)
    }

    const saveEditModel = () => {
        if (editingModelIndex !== null && editModelCode && editModelName) {
            const updatedModels = [...pendingSettings.configuredModels]
            const oldCode = updatedModels[editingModelIndex].code
            updatedModels[editingModelIndex] = { code: editModelCode, displayName: editModelName }
            const newAiModel = pendingSettings.aiModel === oldCode ? editModelCode : pendingSettings.aiModel
            handleSettingChange({ configuredModels: updatedModels, aiModel: newAiModel })
            setEditingModelIndex(null)
            setEditModelCode('')
            setEditModelName('')
        }
    }

    const deleteModel = (index: number) => {
        const modelCode = pendingSettings.configuredModels[index].code
        const updatedModels = pendingSettings.configuredModels.filter((_: any, i: number) => i !== index)
        const newAiModel = pendingSettings.aiModel === modelCode
            ? (updatedModels[0]?.code || 'x-ai/grok-4.1-fast')
            : pendingSettings.aiModel
        handleSettingChange({ configuredModels: updatedModels, aiModel: newAiModel })
    }

    return (
        <div className="settings-container">
            <div className="settings-sidebar">
                <div className="settings-header">
                    <div className="settings-title-wrapper">
                        <h2 className="settings-title">Settings</h2>
                    </div>
                </div>

                <nav className="settings-nav">
                    <button className={`nav-item ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
                    <button className={`nav-item ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>AI Configuration</button>
                    <button className={`nav-item ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')}>Shortcuts</button>
                    <button className={`nav-item ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')}>About</button>
                </nav>
            </div>

            <div className="settings-content">
                {activeTab === 'general' && (
                    <div className="settings-section">
                        <h2 className="section-title">General Settings</h2>
                        <div className="setting-group">
                            <h3>Overlay</h3>
                            <div className="setting-item">
                                <label className="setting-label">
                                    Transparency
                                    <span className="range-value">{Math.round(pendingSettings.overlayTransparency * 100)}%</span>
                                </label>
                                <input
                                    type="range" min="0.5" max="1" step="0.05"
                                    className="setting-range"
                                    value={pendingSettings.overlayTransparency}
                                    onChange={(e) => handleSettingChange({ overlayTransparency: parseFloat(e.target.value) })}
                                />
                                <p className="setting-description">Adjust the opacity of the overlay window.</p>
                            </div>
                            <div className="setting-item">
                                <label className="checkbox-wrapper">
                                    <input
                                        type="checkbox"
                                        className="checkbox-input"
                                        checked={pendingSettings.autoHideOverlay}
                                        onChange={(e) => handleSettingChange({ autoHideOverlay: e.target.checked })}
                                    />
                                    <span>Auto-hide when focus is lost</span>
                                </label>
                            </div>
                        </div>
                        <div className="setting-group danger-zone">
                            <h3>Reset</h3>
                            <div className="setting-item">
                                <p className="setting-description" style={{ marginBottom: '15px' }}>
                                    Restore all settings to their default values. This action cannot be undone.
                                </p>
                                <button onClick={resetSettings} className="danger-btn">Reset to Defaults</button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="settings-section">
                        <h2 className="section-title">AI Configuration</h2>

                        <div className="setting-group">
                            <label className="setting-label">AI Provider</label>
                            <div className="provider-selector">
                                <button
                                    className={`provider-btn ${pendingSettings.modelProvider === 'openrouter' ? 'active' : ''}`}
                                    onClick={() => handleSettingChange({ modelProvider: 'openrouter' })}
                                >
                                    <div className="provider-icon">☁️</div>
                                    <div className="provider-info">
                                        <span className="provider-name">OpenRouter</span>
                                        <span className="provider-desc">Cloud Models (GPT-4, Claude)</span>
                                    </div>
                                </button>

                                <button
                                    className={`provider-btn ${pendingSettings.modelProvider === 'ollama' ? 'active' : ''}`}
                                    onClick={() => handleSettingChange({ modelProvider: 'ollama' })}
                                >
                                    <div className="provider-icon">💻</div>
                                    <div className="provider-info">
                                        <span className="provider-name">Ollama</span>
                                        <span className="provider-desc">Local Models (Llama 3, Mistral)</span>
                                    </div>
                                    {pendingSettings.modelProvider === 'ollama' && (
                                        <div className={`status-dot ${isOllamaConnected ? 'online' : 'offline'}`}
                                            title={isOllamaConnected ? 'Connected' : 'Disconnected'} />
                                    )}
                                </button>
                            </div>
                        </div>

                        {pendingSettings.modelProvider === 'openrouter' ? (
                            <>
                                <div className="setting-group">
                                    <h3>OpenRouter API</h3>
                                    <div className="setting-item">
                                        <label className="setting-label">API Key</label>
                                        <div className="api-key-input-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <input
                                                    type={showApiKey ? "text" : "password"}
                                                    className="setting-input"
                                                    placeholder="Enter your OpenRouter API key..."
                                                    value={pendingSettings.openRouterApiKey}
                                                    onChange={(e) => handleSettingChange({ openRouterApiKey: e.target.value })}
                                                    style={{ flex: 1 }}
                                                />
                                                <button className="visibility-toggle" onClick={() => setShowApiKey(!showApiKey)}>
                                                    {showApiKey ? "Hide" : "Show"}
                                                </button>
                                            </div>
                                            {showApiKey && pendingSettings.openRouterApiKey && (
                                                <div style={{
                                                    padding: '12px',
                                                    background: 'rgba(0,0,0,0.3)',
                                                    borderRadius: '6px',
                                                    fontFamily: 'monospace',
                                                    fontSize: '13px',
                                                    wordBreak: 'break-all',
                                                    color: '#4ade80',
                                                    border: '1px solid rgba(74, 222, 128, 0.2)'
                                                }}>
                                                    {pendingSettings.openRouterApiKey}
                                                </div>
                                            )}
                                        </div>
                                        <p className="setting-description">
                                            Your key is stored locally and never shared. Get one at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>openrouter.ai</a>
                                        </p>
                                    </div>

                                    <div className="setting-item">
                                        <label className="setting-label">Model</label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <select
                                                className="setting-select"
                                                value={pendingSettings.aiModel}
                                                onChange={(e) => handleSettingChange({ aiModel: e.target.value })}
                                            >
                                                {pendingSettings.configuredModels.map(model => (
                                                    <option key={model.code} value={model.code}>{model.displayName}</option>
                                                ))}
                                            </select>
                                            <button onClick={() => setShowModelModal(true)} className="secondary-btn">⚙️ Configure</button>
                                        </div>
                                        <p className="setting-description" style={{ marginTop: '8px' }}>
                                            {pendingSettings.configuredModels?.length || 0} model(s) configured
                                        </p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="setting-group">
                                    <h3>Ollama Configuration</h3>
                                    <div className="setting-item">
                                        <label className="setting-label">Ollama URL</label>
                                        <div className="input-with-button">
                                            <input
                                                type="text"
                                                className="setting-input"
                                                value={pendingSettings.ollamaUrl}
                                                onChange={(e) => handleSettingChange({ ollamaUrl: e.target.value })}
                                                placeholder="http://localhost:11434"
                                            />
                                            <button
                                                className="secondary-btn"
                                                onClick={checkOllama}
                                                disabled={isCheckingOllama}
                                            >
                                                {isCheckingOllama ? 'Checking...' : 'Refresh'}
                                            </button>
                                        </div>
                                        {!isOllamaConnected && !isCheckingOllama && (
                                            <p className="error-message">Could not connect to Ollama. Ensure it's running.</p>
                                        )}
                                    </div>

                                    <div className="setting-item">
                                        <label className="setting-label">API Connection Test</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <button
                                                className="secondary-btn"
                                                onClick={async () => {
                                                    setApiTestResult('Testing connection...')
                                                    const start = Date.now()
                                                    try {
                                                        const connected = await checkOllamaStatus(pendingSettings.ollamaUrl || 'http://localhost:11434')
                                                        const ping = Date.now() - start
                                                        if (connected) {
                                                            const models = await listOllamaModels(pendingSettings.ollamaUrl || 'http://localhost:11434')
                                                            setApiTestResult(`✅ Success! Connected in ${ping}ms.\nFound ${models.length} models available using API version default.`)
                                                        } else {
                                                            setApiTestResult(`❌ Failed to connect to ${pendingSettings.ollamaUrl || 'http://localhost:11434'}.\nEnsure Ollama is running (try 'ollama serve').`)
                                                        }
                                                    } catch (err: any) {
                                                        setApiTestResult(`❌ Error: ${err.message}`)
                                                    }
                                                }}
                                                style={{ alignSelf: 'flex-start' }}
                                            >
                                                Run Connection Test
                                            </button>

                                            {apiTestResult && (
                                                <div style={{
                                                    padding: '12px',
                                                    background: 'rgba(0,0,0,0.2)',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    fontFamily: 'monospace',
                                                    whiteSpace: 'pre-wrap',
                                                    border: apiTestResult.startsWith('✅') ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                                                    color: apiTestResult.startsWith('✅') ? '#4ade80' : '#ef4444'
                                                }}>
                                                    {apiTestResult}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="setting-item">
                                        <label className="setting-label">Local Model</label>
                                        {pendingSettings.ollamaModels?.length > 0 ? (
                                            <select
                                                className="setting-select"
                                                value={pendingSettings.aiModel}
                                                onChange={(e) => handleSettingChange({ aiModel: e.target.value })}
                                            >
                                                {pendingSettings.ollamaModels.map(model => (
                                                    <option key={model.code} value={model.code}>{model.displayName}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="empty-state-message">
                                                No models found. Run <code>ollama pull llama3</code>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="setting-group">
                            <h3>Behavior</h3>
                            <div className="setting-item">
                                <label className="setting-label">System Prompt</label>
                                <textarea
                                    className="setting-textarea"
                                    value={pendingSettings.systemPrompt}
                                    onChange={(e) => handleSettingChange({ systemPrompt: e.target.value })}
                                    placeholder="You are a helpful AI assistant..."
                                    rows={4}
                                    style={{
                                        width: '100%',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '6px',
                                        padding: '10px',
                                        color: '#fff',
                                        marginTop: '5px',
                                        resize: 'vertical'
                                    }}
                                />
                                <p className="setting-description">Instructions that define how the AI behaves.</p>
                            </div>

                            <div className="setting-item">
                                <label className="checkbox-wrapper">
                                    <input
                                        type="checkbox"
                                        className="checkbox-input"
                                        checked={pendingSettings.streamResponses}
                                        onChange={(e) => handleSettingChange({ streamResponses: e.target.checked })}
                                    />
                                    <span>Stream Responses (Typewriter effect)</span>
                                </label>
                            </div>
                        </div>

                        <div className="setting-group">
                            <h3>Parameters</h3>
                            <div className="setting-item">
                                <label className="setting-label">
                                    Temperature
                                    <span className="range-value">{pendingSettings.temperature}</span>
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    className="setting-range"
                                    value={pendingSettings.temperature}
                                    onChange={(e) => handleSettingChange({ temperature: parseFloat(e.target.value) })}
                                />
                                <p className="setting-description">Higher values make output more random, lower values more deterministic.</p>
                            </div>

                            <div className="setting-item">
                                <label className="setting-label">Max Tokens</label>
                                <input
                                    type="number"
                                    className="setting-input"
                                    value={pendingSettings.maxTokens}
                                    onChange={(e) => handleSettingChange({ maxTokens: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'shortcuts' && (
                    <div className="settings-section">
                        <h2 className="section-title">Keyboard Shortcuts</h2>

                        <div className="setting-group">
                            <h3>Global Shortcuts</h3>
                            <div className="setting-item">
                                <label className="setting-label">Toggle Overlay</label>
                                <input
                                    type="text"
                                    className="setting-input"
                                    value={pendingSettings.shortcuts.toggleOverlay}
                                    readOnly
                                    style={{ cursor: 'not-allowed', opacity: 0.7 }}
                                />
                                <p className="setting-description">
                                    Currently set to Command/Control + Shift + Z. Customization coming soon.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'about' && (
                    <div className="settings-section">
                        <h2 className="section-title">About Zura</h2>

                        <div className="setting-group">
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zura</h1>
                                <p style={{ fontSize: '1.1rem', color: '#aaa' }}>Your AI Companion for Desktop</p>
                                <div style={{ marginTop: '30px', color: '#666' }}>
                                    <p>Version 1.0.0</p>
                                    <p>© 2024 Zura AI</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {hasChanges && (
                <div className="save-bar" style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#252525',
                    padding: '15px 30px',
                    borderRadius: '50px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    display: 'flex',
                    gap: '15px',
                    alignItems: 'center',
                    zIndex: 1000,
                    border: '1px solid rgba(255,255,255,0.1)'
                }}>
                    <span style={{ color: '#ccc', marginRight: '10px' }}>Unsaved changes</span>
                    <button
                        onClick={cancelChanges}
                        style={{
                            background: 'transparent',
                            border: '1px solid #666',
                            color: '#ccc',
                            padding: '8px 20px',
                            borderRadius: '20px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={saveChanges}
                        style={{
                            background: '#3b82f6',
                            border: 'none',
                            color: 'white',
                            padding: '8px 20px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Save Changes
                    </button>
                </div>
            )}

            {showModelModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000
                }}>
                    <div style={{
                        background: '#1a1a1a',
                        borderRadius: '16px',
                        width: '90%',
                        maxWidth: '600px',
                        maxHeight: '80vh',
                        overflow: 'auto',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '20px',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            position: 'sticky',
                            top: 0,
                            background: '#1a1a1a',
                            zIndex: 1
                        }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Configure Models</h2>
                            <button
                                onClick={() => {
                                    setShowModelModal(false);
                                    setEditingModelIndex(null);
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#888',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '5px'
                                }}
                            >×</button>
                        </div>

                        {/* Modal Content */}
                        <div style={{ padding: '20px' }}>
                            {/* All Configured Models */}
                            <div style={{ marginBottom: '25px' }}>
                                <h3 style={{ fontSize: '0.9rem', color: '#888', marginBottom: '12px' }}>Your Models</h3>
                                {pendingSettings.configuredModels && pendingSettings.configuredModels.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {pendingSettings.configuredModels.map((model: { code: string; displayName: string }, index: number) => (
                                            <div key={model.code} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 15px',
                                                background: pendingSettings.aiModel === model.code ? 'rgba(255, 140, 105, 0.1)' : 'rgba(255,255,255,0.03)',
                                                borderRadius: '10px',
                                                border: pendingSettings.aiModel === model.code ? '1px solid #FF8C69' : '1px solid transparent'
                                            }}>
                                                {editingModelIndex === index ? (
                                                    <div style={{ flex: 1, display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                        <input
                                                            value={editModelCode}
                                                            onChange={(e) => setEditModelCode(e.target.value)}
                                                            placeholder="Model Code"
                                                            className="setting-input"
                                                            style={{ flex: 1, padding: '8px' }}
                                                        />
                                                        <input
                                                            value={editModelName}
                                                            onChange={(e) => setEditModelName(e.target.value)}
                                                            placeholder="Display Name"
                                                            className="setting-input"
                                                            style={{ flex: 1, padding: '8px' }}
                                                        />
                                                        <button onClick={saveEditModel} style={{ padding: '8px 12px', background: '#22c55e', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>✓</button>
                                                        <button onClick={() => setEditingModelIndex(null)} style={{ padding: '8px 12px', background: '#666', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>✕</button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div>
                                                            <div style={{ fontWeight: 500 }}>{model.displayName}</div>
                                                            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{model.code}</div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            {pendingSettings.aiModel === model.code ? (
                                                                <span style={{ color: '#FF8C69', fontSize: '12px', padding: '4px 10px', background: 'rgba(255, 140, 105, 0.2)', borderRadius: '4px' }}>Active</span>
                                                            ) : (
                                                                <button onClick={() => handleSettingChange({ aiModel: model.code })} style={{
                                                                    padding: '6px 14px',
                                                                    background: 'rgba(255,255,255,0.1)',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    color: '#ccc',
                                                                    cursor: 'pointer',
                                                                    fontSize: '12px'
                                                                }}>Use</button>
                                                            )}
                                                            <button onClick={() => startEditModel(index)} style={{
                                                                padding: '6px 10px',
                                                                background: 'rgba(59, 130, 246, 0.2)',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                color: '#3b82f6',
                                                                cursor: 'pointer',
                                                                fontSize: '12px'
                                                            }}>✎</button>
                                                            <button onClick={() => deleteModel(index)} style={{
                                                                padding: '6px 10px',
                                                                background: 'rgba(239, 68, 68, 0.2)',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                color: '#ef4444',
                                                                cursor: 'pointer',
                                                                fontSize: '12px'
                                                            }}>✕</button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: '#666', fontSize: '14px' }}>No models configured.</p>
                                )}
                            </div>

                            {/* Add New Model Form */}
                            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <h3 style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: '15px' }}>Add New Model</h3>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                    <input
                                        type="text"
                                        placeholder="Model Code (e.g. amazon/nova-pro-v1)"
                                        value={newModelCode}
                                        onChange={(e) => setNewModelCode(e.target.value)}
                                        className="setting-input"
                                        style={{ flex: 1, padding: '12px' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Display Name"
                                        value={newModelName}
                                        onChange={(e) => setNewModelName(e.target.value)}
                                        className="setting-input"
                                        style={{ flex: 1, padding: '12px' }}
                                    />
                                </div>
                                <button
                                    onClick={addModel}
                                    disabled={!newModelCode || !newModelName}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        background: (newModelCode && newModelName) ? '#3b82f6' : 'rgba(59, 130, 246, 0.3)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: (newModelCode && newModelName) ? 'pointer' : 'default',
                                        fontWeight: 500
                                    }}
                                >
                                    + Add Model
                                </button>
                                <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                                    Find model codes at <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>openrouter.ai/models</a>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
