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

    return (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'transparent',
                    border: 'none',
                    color: '#e0e0e0',
                    fontSize: '1rem', // Match 5.1 Thinking size roughly
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease',
                    userSelect: 'none'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <span style={{ color: '#aaa', fontWeight: 400, marginRight: '4px' }}>
                    {settings.modelProvider === 'ollama' ? 'Ollama' : settings.modelProvider === 'perplexity' ? 'Perplexity' : 'AI'}
                </span>
                <span>{currentModelName}</span>
                <ChevronDown size={14} style={{ color: '#888', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '0',
                    marginTop: '8px',
                    width: '300px',
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    zIndex: 100,
                    padding: '6px',
                    overflow: 'hidden'
                }}>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <div style={{
                            padding: '8px 12px',
                            fontSize: '0.75rem',
                            color: '#666',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Select Model
                        </div>
                        {models.map(model => (
                            <div
                                key={model.code}
                                onClick={() => handleSelectModel(model.code)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    backgroundColor: settings.aiModel === model.code ? 'rgba(255,255,255,0.08)' : 'transparent',
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
                                    <span style={{ color: '#e0e0e0', fontSize: '0.9rem', fontWeight: 500 }}>{model.displayName}</span>
                                    <span style={{ color: '#666', fontSize: '0.75rem' }}>{model.code}</span>
                                </div>
                                {settings.aiModel === model.code && <Check size={16} color="#22c55e" />}
                            </div>
                        ))}
                        {models.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
                                No models configured for this provider.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
