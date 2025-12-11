import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Sparkles } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'

export default function ModelSelector() {
    const { settings, updateSettings } = useSettings()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Get available models based on provider
    const getAvailableModels = () => {
        switch (settings.modelProvider) {
            case 'ollama':
                return settings.ollamaModels
            case 'perplexity':
                return settings.perplexityModels
            case 'openrouter':
            default:
                return settings.configuredModels
        }
    }

    const models = getAvailableModels() || []
    const currentModelName = models.find(m => m.code === settings.aiModel)?.displayName || settings.aiModel.split('/').pop()

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelectModel = (modelCode: string) => {
        updateSettings({ aiModel: modelCode })
        setIsOpen(false)
    }

    const getProviderIcon = () => {
        // You could add specific icons here later
        return <Sparkles size={14} className={settings.modelProvider === 'ollama' ? 'text-green-400' : 'text-orange-400'} />
    }

    return (
        <div style={{ position: 'relative', zIndex: 50 }} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: isOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e0e0e0',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '8px 16px 8px 12px',
                    borderRadius: '24px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: isOpen ? '0 0 0 2px rgba(255,255,255,0.1)' : 'none'
                }}
                onMouseEnter={e => {
                    if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                }}
                onMouseLeave={e => {
                    if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)'
                }}>
                    {getProviderIcon()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                    <span style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {settings.modelProvider === 'ollama' ? 'Ollama' : settings.modelProvider === 'perplexity' ? 'Perplexity' : 'Cloud'}
                    </span>
                    <span style={{ fontSize: '0.85rem' }}>{currentModelName}</span>
                </div>

                <ChevronDown
                    size={14}
                    style={{
                        color: '#888',
                        marginLeft: '8px',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                />
            </button>

            {/* Dropdown with animation logic needing CSS or simple mounting */}
            {isOpen && (
                <div className="model-dropdown-im" style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: '0',
                    width: '320px',
                    backgroundColor: 'rgba(30, 30, 30, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                    padding: '8px',
                    overflow: 'hidden',
                    animation: 'dropdown-slide 0.2s ease-out'
                }}>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <div style={{
                            padding: '12px 12px 8px',
                            fontSize: '0.75rem',
                            color: '#666',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            marginBottom: '8px'
                        }}>
                            Available Models
                        </div>
                        {models.map(model => (
                            <div
                                key={model.code}
                                onClick={() => handleSelectModel(model.code)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px',
                                    cursor: 'pointer',
                                    borderRadius: '10px',
                                    backgroundColor: settings.aiModel === model.code ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    transition: 'all 0.15s',
                                    marginBottom: '2px',
                                    border: settings.aiModel === model.code ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent'
                                }}
                                onMouseEnter={e => {
                                    if (settings.aiModel !== model.code) {
                                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                                        e.currentTarget.style.transform = 'translateX(2px)'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (settings.aiModel !== model.code) {
                                        e.currentTarget.style.backgroundColor = 'transparent'
                                        e.currentTarget.style.transform = 'none'
                                    }
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ color: settings.aiModel === model.code ? '#fff' : '#e0e0e0', fontSize: '0.9rem', fontWeight: 500 }}>
                                        {model.displayName}
                                    </span>
                                    <span style={{ color: settings.aiModel === model.code ? '#aaa' : '#666', fontSize: '0.75rem' }}>
                                        {model.code}
                                    </span>
                                </div>
                                {settings.aiModel === model.code && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        padding: '4px',
                                        borderRadius: '50%',
                                        boxShadow: '0 0 10px rgba(118, 75, 162, 0.5)'
                                    }}>
                                        <Check size={12} color="#fff" strokeWidth={3} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes dropdown-slide {
                    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                
                /* Custom Scrollbar for dropdown */
                .model-dropdown-im ::-webkit-scrollbar {
                    width: 4px;
                }
                .model-dropdown-im ::-webkit-scrollbar-track {
                    background: transparent;
                }
                .model-dropdown-im ::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1);
                    border-radius: 2px;
                }
                .model-dropdown-im ::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.2);
                }
            `}</style>
        </div>
    )
}
