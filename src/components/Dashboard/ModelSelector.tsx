import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Check, Settings, Search, Sparkles, Zap, Brain, Box, MessageSquare, Image as ImageIcon, Eye, Star, Filter, ArrowLeft, Cpu } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'

interface ModelWithProvider {
    code: string
    displayName: string
    provider: 'ollama' | 'perplexity' | 'openrouter'
}

export default function ModelSelector() {
    const { settings, updateSettings } = useSettings()
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<'favorites' | 'list'>('favorites')
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Get ALL models from ALL providers
    const getAllModels = (): ModelWithProvider[] => {
        const allModels: ModelWithProvider[] = []

        if (settings.ollamaModels) {
            settings.ollamaModels.forEach(m => allModels.push({ ...m, provider: 'ollama' }))
        }
        if (settings.perplexityModels) {
            settings.perplexityModels.forEach(m => allModels.push({ ...m, provider: 'perplexity' }))
        }
        if (settings.configuredModels) {
            settings.configuredModels.forEach(m => allModels.push({ ...m, provider: 'openrouter' }))
        }
        return allModels
    }

    const allModels = useMemo(() => getAllModels(), [settings])

    // Helper component for Logo with fallback
    const ModelIcon = ({ model, icon, color, size = 24 }: any) => {
        const [imgError, setImgError] = useState(false)
        const sanitizedCode = model.code.replace(/[:\/]/g, '-')

        if (!imgError) {
            return (
                <img
                    src={`/model-logos/${sanitizedCode}.png`}
                    alt={model.displayName}
                    onError={(e) => {
                        // Try common variations just in case? No, keep it simple.
                        setImgError(true)
                    }}
                    style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain', borderRadius: '4px' }}
                />
            )
        }

        return (
            <div style={{
                padding: size === 24 ? '12px' : '0',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: size === 24 ? `linear-gradient(145deg, ${color}22, transparent)` : 'transparent',
                color: color
            }}>
                {React.cloneElement(icon as React.ReactElement, { size: size })}
            </div>
        )
    }

    // Detect Model Family & Attributes
    const getModelAttributes = (model: ModelWithProvider) => {
        const code = model.code.toLowerCase()
        const name = model.displayName.toLowerCase()

        let icon = <MessageSquare size={16} />
        let color = '#888'
        let badge = null

        // Icon Logic
        if (code.includes('gemini') || name.includes('gemini')) {
            icon = <Sparkles size={16} />
            color = '#4dabf7' // Blue/Cyan
        } else if (code.includes('claude') || name.includes('claude')) {
            icon = <Box size={16} />
            color = '#da7756' // Orange/Brown like Claude logo
        } else if (code.includes('gpt') || name.includes('gpt') || code.includes('openai')) {
            icon = <Cpu size={16} />
            color = '#10a37f' // OpenAI Green
        } else if (code.includes('mistral') || name.includes('mistral')) {
            icon = <Zap size={16} />
            color = '#fcc419' // Yellow
        } else if (code.includes('llama') || name.includes('llama')) {
            icon = <Brain size={16} />
            color = '#339af0' // Blue
        }

        // Badge Logic
        if (name.includes('flash') || name.includes('turbo') || name.includes('instant')) {
            badge = <Zap size={10} color="#fcc419" fill="currentColor" />
        } else if (name.includes('pro') || name.includes('plus') || name.includes('opus')) {
            badge = <Sparkles size={10} color="#da7756" fill="currentColor" />
        } else if (name.includes('reasoning') || code.includes('reasoning')) {
            badge = <Brain size={10} color="#be4bdb" fill="currentColor" />
        }

        return { icon, color, badge }
    }

    const filteredModels = useMemo(() => {
        if (!searchQuery.trim()) return allModels
        return allModels.filter(m =>
            m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.code.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [allModels, searchQuery])

    // Simplified Favorites Logic (pinned heuristics for now)
    const favoriteModels = useMemo(() => {
        // Prioritize: Gemini, Claude, GPT
        return allModels.filter(m => {
            const lower = m.displayName.toLowerCase()
            return lower.includes('gpt-4') || lower.includes('claude-3') || lower.includes('gemini') || lower.includes('sonar')
        }).slice(0, 8) // Limit to top 8 to simulate favorites
    }, [allModels])


    const currentModel = allModels.find(m => m.code === settings.aiModel)
    const currentName = currentModel?.displayName || settings.aiModel.split('/').pop()

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelect = (model: ModelWithProvider) => {
        updateSettings({ aiModel: model.code, modelProvider: model.provider })
        setIsOpen(false)
    }

    return (
        <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: '12px',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    color: '#e0e0e0'
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                }}
            >
                {/* Current Model Icon */}
                {currentModel ? (
                    <ModelIcon
                        model={currentModel}
                        icon={getModelAttributes(currentModel).icon}
                        color={getModelAttributes(currentModel).color}
                        size={16}
                    />
                ) : <Cpu size={14} />}

                <span className="truncate" style={{ maxWidth: '120px' }}>{currentName}</span>
                <ChevronDown size={14} style={{ opacity: 0.5, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {/* Rich Popover */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 12px)',
                    left: '-12px',
                    width: '380px',
                    backgroundColor: '#111',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '20px',
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    animation: 'dropdown-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    backdropFilter: 'blur(20px)',
                    zIndex: 1000
                }}>
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
                    <div className="custom-scrollbar" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>

                        {/* Favorites Grid (Only show if no search or searching favorites) */}
                        {!searchQuery.trim() && viewMode === 'favorites' && (
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: '#ff6b6b', fontSize: '0.85rem', fontWeight: 600 }}>
                                    <Star size={12} fill="currentColor" />
                                    <span>Favorites</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                    {favoriteModels.map(model => {
                                        const { icon, color, badge } = getModelAttributes(model)
                                        const isActive = settings.aiModel === model.code
                                        return (
                                            <div
                                                key={model.code}
                                                onClick={() => handleSelect(model)}
                                                style={{
                                                    background: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                                                    border: isActive ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.06)',
                                                    borderRadius: '16px',
                                                    padding: '16px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    position: 'relative'
                                                }}
                                                onMouseEnter={e => {
                                                    if (!isActive) {
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                                                    }
                                                }}
                                                onMouseLeave={e => {
                                                    if (!isActive) {
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                                                    }
                                                }}
                                            >
                                                {/* Badge */}
                                                {badge && <div style={{ position: 'absolute', top: '10px', right: '10px' }}>{badge}</div>}

                                                {/* Icon */}
                                                <ModelIcon
                                                    model={model}
                                                    icon={icon}
                                                    color={color}
                                                />

                                                {/* Name */}
                                                <span style={{ color: '#eee', fontSize: '0.85rem', fontWeight: 500, textAlign: 'center', lineHeight: '1.4' }}>
                                                    {model.displayName}
                                                </span>

                                                {/* Action Bar (View/Select) */}
                                                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', width: '100%' }}>
                                                    <div style={{
                                                        flex: 1,
                                                        background: 'rgba(255,255,255,0.05)',
                                                        borderRadius: '8px',
                                                        height: '28px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: isActive ? '#fff' : '#666'
                                                    }}>
                                                        <Eye size={14} />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* List Section (Others or Search Results) */}
                        <div>
                            {!searchQuery.trim() && viewMode === 'favorites' && (
                                <div style={{ marginBottom: '12px', color: '#888', fontSize: '0.85rem', fontWeight: 600 }}>
                                    Others
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {(searchQuery.trim() ? filteredModels : allModels.filter(m => !favoriteModels.includes(m))).map(model => {
                                    const { icon, color, badge } = getModelAttributes(model)
                                    const isActive = settings.aiModel === model.code
                                    return (
                                        <div
                                            key={model.code}
                                            onClick={() => handleSelect(model)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
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
                                            <div style={{ display: 'flex' }}>
                                                <ModelIcon
                                                    model={model}
                                                    icon={icon}
                                                    color={color}
                                                    size={20}
                                                />
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{model.displayName}</span>
                                                {badge}
                                            </div>

                                            {/* Action Buttons */}
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: isActive ? '#fff' : '#666' }}>
                                                    <Eye size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {filteredModels.length === 0 && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No models found</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer / Tabs */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '12px',
                        borderTop: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <button
                            onClick={() => setViewMode('favorites')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'transparent', border: 'none',
                                color: viewMode === 'favorites' ? '#ff6b6b' : '#666',
                                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                            }}>
                            {/* Dot Indicator */}
                            {viewMode === 'favorites' && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></div>}
                            Favorites
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'transparent', border: 'none',
                                color: viewMode === 'list' ? '#ff6b6b' : '#666',
                                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                            }}>
                            {viewMode === 'list' && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></div>}
                            Show all
                        </button>
                        <Filter size={14} color="#666" />
                    </div>

                </div>
            )}

            <style>{`
                @keyframes dropdown-slide-up {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            `}</style>
        </div>
    )
}
