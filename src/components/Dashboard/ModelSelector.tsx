import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Settings } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'

interface ModelWithProvider {
    code: string
    displayName: string
    provider: 'ollama' | 'perplexity' | 'openrouter'
}

export default function ModelSelector() {
    const { settings, updateSettings } = useSettings()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Get ALL models from ALL providers
    const getAllModels = (): ModelWithProvider[] => {
        const allModels: ModelWithProvider[] = []

        // Ollama models
        if (settings.ollamaModels && settings.ollamaModels.length > 0) {
            settings.ollamaModels.forEach(m => {
                allModels.push({ ...m, provider: 'ollama' })
            })
        }

        // Perplexity models
        if (settings.perplexityModels && settings.perplexityModels.length > 0) {
            settings.perplexityModels.forEach(m => {
                allModels.push({ ...m, provider: 'perplexity' })
            })
        }

        // OpenRouter models
        if (settings.configuredModels && settings.configuredModels.length > 0) {
            settings.configuredModels.forEach(m => {
                allModels.push({ ...m, provider: 'openrouter' })
            })
        }

        return allModels
    }

    const allModels = getAllModels()

    // Find current model info
    const currentModel = allModels.find(m => m.code === settings.aiModel)
    const currentModelName = currentModel?.displayName || settings.aiModel.split('/').pop()

    const getProviderLabel = (provider: string) => {
        switch (provider) {
            case 'ollama': return 'Ollama'
            case 'perplexity': return 'Perplexity'
            case 'openrouter': return 'OpenRouter'
            default: return provider
        }
    }

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

    const handleSelectModel = (model: ModelWithProvider) => {
        // Update both the model AND the provider
        updateSettings({
            aiModel: model.code,
            modelProvider: model.provider
        })
        setIsOpen(false)
    }

    // Group models by provider
    const ollamaModels = allModels.filter(m => m.provider === 'ollama')
    const perplexityModels = allModels.filter(m => m.provider === 'perplexity')
    const openrouterModels = allModels.filter(m => m.provider === 'openrouter')

    const renderModelGroup = (title: string, models: ModelWithProvider[]) => {
        if (models.length === 0) return null
        return (
            <div key={title}>
                <div style={{
                    padding: '8px 12px 4px',
                    fontSize: '0.65rem',
                    color: '#666',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                    {title}
                </div>
                {models.map(model => (
                    <div
                        key={model.code}
                        onClick={() => handleSelectModel(model)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            backgroundColor: settings.aiModel === model.code ? 'rgba(255,255,255,0.06)' : 'transparent',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => {
                            if (settings.aiModel !== model.code) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                        }}
                        onMouseLeave={e => {
                            if (settings.aiModel !== model.code) e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: '#e0e0e0', fontSize: '0.85rem', fontWeight: 500 }}>{model.displayName}</span>
                        </div>
                        {settings.aiModel === model.code && <Check size={14} color="#fff" />}
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '6px 10px',
                    borderRadius: '16px',
                    transition: 'all 0.2s ease',
                    color: '#fff'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
                <Settings size={12} color="#888" />
                <span style={{ color: '#888' }}>{getProviderLabel(settings.modelProvider)}</span>
                <span style={{ color: '#ccc' }}>{currentModelName}</span>
                <ChevronDown
                    size={14}
                    style={{
                        color: '#666',
                        marginLeft: '2px',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                        opacity: 0.7
                    }}
                />
            </button>

            {/* Dropdown - Opens upward since it's at bottom of screen */}
            {isOpen && (
                <div className="model-dropdown-text" style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: '0',
                    width: '280px',
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
                    padding: '6px',
                    overflow: 'hidden',
                    zIndex: 101,
                    animation: 'dropdown-fade-up 0.15s ease-out'
                }}>
                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                        {renderModelGroup('Ollama', ollamaModels)}
                        {renderModelGroup('Perplexity', perplexityModels)}
                        {renderModelGroup('OpenRouter', openrouterModels)}
                        {allModels.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
                                No models configured. Check Settings.
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes dropdown-fade {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes dropdown-fade-up {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .model-dropdown-text ::-webkit-scrollbar { width: 4px; }
                .model-dropdown-text ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
            `}</style>
        </div>
    )
}
