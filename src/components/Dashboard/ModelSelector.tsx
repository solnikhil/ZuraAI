import React, { useState, useRef, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { ChevronDown, Check, Settings, Search, Sparkles, Zap, Brain, Box, MessageSquare, Image as ImageIcon, Eye, Star, Filter, ArrowLeft, Cpu, Cloud, Database, Globe, Grid, LayoutGrid, ArrowRight, Expand, ChevronUp } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'

interface ModelWithProvider {
    code: string
    displayName: string
    provider: 'ollama' | 'perplexity' | 'openrouter' | 'gemini' | 'groq' | 'codex'
}

type ViewMode = 'favorites' | 'all'

export default function ModelSelector({ minimal }: { minimal?: boolean }) {
    const { settings, updateSettings } = useSettings()
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<ViewMode>('favorites')
    const [isListExpanded, setIsListExpanded] = useState(false)
    // Collapse states for groups
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
        ollama: false,
        perplexity: false,
        openrouter: false,
        gemini: false,
        groq: false,
        codex: false
    })

    const dropdownRef = useRef<HTMLDivElement>(null)
    const portalRef = useRef<HTMLDivElement>(null)
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 320, showAbove: true })

    // Toggle handler
    const toggleOpen = () => {
        if (!isOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const dropdownHeight = isListExpanded ? 520 : 480
            const dropdownWidth = isListExpanded ? 640 : 360
            const padding = 16
            
            const spaceAbove = rect.top
            const spaceBelow = viewportHeight - rect.bottom
            const showAbove = spaceAbove >= dropdownHeight + padding || spaceAbove > spaceBelow
            
            let top: number
            if (showAbove) {
                top = rect.top - 12
            } else {
                top = rect.bottom + 12
            }
            
            let left = rect.left
            if (left + dropdownWidth > viewportWidth - padding) {
                left = viewportWidth - dropdownWidth - padding
            }
            if (left < padding) {
                left = padding
            }
            
            setDropdownPos({
                top,
                left,
                width: dropdownWidth,
                showAbove
            })
            setIsOpen(true)
        } else {
            setIsOpen(false)
        }
    }

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
        if (settings.geminiModels) {
            settings.geminiModels.forEach(m => allModels.push({ ...m, provider: 'gemini' }))
        }
        if (settings.groqModels) {
            settings.groqModels.forEach(m => allModels.push({ ...m, provider: 'groq' }))
        }
        if (settings.codexModels) {
            settings.codexModels.forEach(m => allModels.push({ ...m, provider: 'codex' }))
        }
        return allModels
    }

    const allModels = useMemo(() => getAllModels(), [settings])

    // Get favorite models
    const favoriteModels = useMemo(() => {
        const favs = settings.favoriteModels || []
        
        if (favs.length === 0) {
            // No favorites set - show empty state
            return []
        }
        return allModels.filter(m => favs.includes(m.code))
    }, [allModels, settings.favoriteModels])

    // Toggle favorite
    const toggleFavorite = (modelCode: string, e: React.MouseEvent) => {
        e.stopPropagation()
        const currentFavorites = settings.favoriteModels || []
        const newFavorites = currentFavorites.includes(modelCode)
            ? currentFavorites.filter(f => f !== modelCode)
            : [...currentFavorites, modelCode]
        updateSettings({ favoriteModels: newFavorites })
    }

    // Helper component for Logo with fallback
    const ModelIcon = ({ model, icon, color, size = 24 }: any) => {
        const [imgError, setImgError] = useState(false)
        const provider = model.provider

        if (!imgError) {
            return (
                <img
                    src={`/provider-logos/${provider}.png`}
                    alt={model.displayName}
                    onError={() => setImgError(true)}
                    style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain', borderRadius: '6px' }}
                />
            )
        }

        return (
            <div style={{
                padding: size === 24 ? '10px' : '0',
                borderRadius: size === 24 ? '10px' : '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: size === 24 ? `linear-gradient(145deg, ${color}22, transparent)` : 'transparent',
                color: color
            }}>
                {React.cloneElement(icon as React.ReactElement, { size: size === 24 ? 20 : 14 })}
            </div>
        )
    }

    // Provider Logo
    const ProviderLogo = ({ provider, size = 14 }: { provider: string, size?: number }) => {
        const [imgError, setImgError] = useState(false)
        if (!imgError) {
            return (
                <img
                    src={`/provider-logos/${provider}.png`}
                    alt={provider}
                    onError={() => setImgError(true)}
                    style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
                />
            )
        }
        return null
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

    // Detect Model Family & Attributes
    const getModelAttributes = (model: ModelWithProvider) => {
        const code = model.code.toLowerCase()
        const name = model.displayName.toLowerCase()

        let icon = <MessageSquare size={16} />
        let color = '#b0b0b0'
        let badge = null

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

        if (name.includes('flash') || name.includes('turbo') || name.includes('instant')) {
            badge = <Zap size={10} color="#fcc419" fill="currentColor" />
        } else if (name.includes('pro') || name.includes('plus') || name.includes('opus')) {
            badge = <Sparkles size={10} color="#da7756" fill="currentColor" />
        } else if (name.includes('reasoning') || code.includes('reasoning')) {
            badge = <Brain size={10} color="#be4bdb" fill="currentColor" />
        }

        return { icon, color, badge }
    }

    // Find current model
    const currentModel = allModels.find(m => m.code === settings.aiModel && m.provider === settings.modelProvider)
    const currentNameRaw = currentModel?.displayName || settings.aiModel.split('/').pop() || settings.aiModel
    const currentName = removeEmojis(currentNameRaw)

    // Filter Logic
    const filteredModels = useMemo(() => {
        if (!searchQuery.trim()) return allModels
        return allModels.filter(m =>
            m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.code.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [allModels, searchQuery])

    const groupedModels = useMemo(() => {
        return {
            ollama: filteredModels.filter(m => m.provider === 'ollama'),
            perplexity: filteredModels.filter(m => m.provider === 'perplexity'),
            openrouter: filteredModels.filter(m => m.provider === 'openrouter'),
            gemini: filteredModels.filter(m => m.provider === 'gemini'),
            groq: filteredModels.filter(m => m.provider === 'groq'),
            codex: filteredModels.filter(m => m.provider === 'codex')
        }
    }, [filteredModels])

    // Recalculate position
    useEffect(() => {
        if (!isOpen || !dropdownRef.current || !portalRef.current) return

        const updatePosition = () => {
            if (!dropdownRef.current || !portalRef.current) return
            
            const rect = dropdownRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const dropdownHeight = isListExpanded ? 520 : 480
            const dropdownWidth = isListExpanded ? 640 : 360
            const padding = 16
            
            const spaceAbove = rect.top
            const spaceBelow = viewportHeight - rect.bottom
            const showAbove = spaceAbove >= dropdownHeight + padding || spaceAbove > spaceBelow
            
            let top: number
            if (showAbove) {
                top = rect.top - 12
            } else {
                top = rect.bottom + 12
            }
            
            let left = rect.left
            if (left + dropdownWidth > viewportWidth - padding) {
                left = viewportWidth - dropdownWidth - padding
            }
            if (left < padding) {
                left = padding
            }
            
            setDropdownPos({
                top,
                left,
                width: dropdownWidth,
                showAbove
            })
        }

        const timeoutId = setTimeout(updatePosition, 0)
        window.addEventListener('scroll', updatePosition, true)
        window.addEventListener('resize', updatePosition)
        
        return () => {
            clearTimeout(timeoutId)
            window.removeEventListener('scroll', updatePosition, true)
            window.removeEventListener('resize', updatePosition)
        }
    }, [isOpen, isListExpanded])

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node
            if (dropdownRef.current && !dropdownRef.current.contains(target) &&
                portalRef.current && !portalRef.current.contains(target)) {
                setIsOpen(false)
            }
        }
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 0)
        return () => {
            clearTimeout(timeoutId)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    const handleSelect = (model: ModelWithProvider, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation()
            e.preventDefault()
        }
        setIsOpen(false)
        updateSettings({ aiModel: model.code, modelProvider: model.provider })
    }

    const toggleGroup = (provider: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [provider]: !prev[provider]
        }))
    }

    // Render model item with favorite star on hover
    const renderModelItem = (model: ModelWithProvider, isActive: boolean, isCompact: boolean = false) => {
        const { icon: attrIcon, color, badge } = getModelAttributes(model)
        const isFavorite = settings.favoriteModels?.includes(model.code) || false

        return (
            <div
                key={model.code}
                onClick={(e) => handleSelect(model, e)}
                onMouseDown={(e) => e.stopPropagation()}
                className={`model-item ${isActive ? 'model-item-active' : ''}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: isCompact ? '8px 10px' : '12px',
                    borderRadius: '10px',
                    background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                    cursor: 'pointer',
                    position: 'relative'
                }}
                onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    // Show star on hover
                    const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
                    if (starBtn) starBtn.style.opacity = '1'
                }}
                onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                    // Hide star on hover out
                    const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
                    if (starBtn && !isFavorite) starBtn.style.opacity = '0'
                }}
            >
                <ModelIcon
                    model={model}
                    icon={attrIcon}
                    color={color}
                    size={isCompact ? 20 : 24}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                        color: '#ddd', 
                        fontSize: isCompact ? '0.85rem' : '0.9rem', 
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {removeEmojis(model.displayName)}
                    </div>
                    {!isCompact && (
                        <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>{model.provider}</div>
                    )}
                </div>
                {badge}
                
                {/* Star button - shows on hover */}
                <button
                    className={`star-btn ${isFavorite ? 'favorited' : ''}`}
                    onClick={(e) => toggleFavorite(model.code, e)}
                    style={{
                        opacity: isFavorite ? 1 : 0,
                        padding: '4px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onMouseEnter={e => {
                        e.stopPropagation()
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    }}
                    onMouseLeave={e => {
                        e.stopPropagation()
                        e.currentTarget.style.background = 'transparent'
                    }}
                >
                    <Star size={14} fill={isFavorite ? '#FFD700' : 'none'} color={isFavorite ? '#FFD700' : '#666'} />
                </button>

                {isActive && <Check size={16} color="#fff" />}
            </div>
        )
    }

    // Render compact model item for list view
    const renderCompactModelItem = (model: ModelWithProvider, isActive: boolean) => {
        const { color } = getModelAttributes(model)
        const isFavorite = settings.favoriteModels?.includes(model.code) || false

        return (
            <div
                key={model.code}
                onClick={(e) => handleSelect(model, e)}
                onMouseDown={(e) => e.stopPropagation()}
                className={`compact-model-item ${isActive ? 'compact-model-item-active' : ''}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    cursor: 'pointer',
                    minWidth: 0,
                    flexShrink: 0
                }}
                onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
                    if (starBtn) starBtn.style.opacity = '1'
                }}
                onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                    const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
                    if (starBtn && !isFavorite) starBtn.style.opacity = '0'
                }}
            >
                <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    background: color,
                    flexShrink: 0
                }} />
                <span style={{ 
                    flex: 1, 
                    fontSize: '0.8rem', 
                    color: isActive ? '#fff' : '#b0b0b0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {removeEmojis(model.displayName)}
                </span>
                <button
                    className={`star-btn ${isFavorite ? 'favorited' : ''}`}
                    onClick={(e) => toggleFavorite(model.code, e)}
                    style={{
                        opacity: isFavorite ? 1 : 0,
                        padding: '3px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onMouseEnter={e => {
                        e.stopPropagation()
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    }}
                    onMouseLeave={e => {
                        e.stopPropagation()
                        e.currentTarget.style.background = 'transparent'
                    }}
                >
                    <Star size={12} fill={isFavorite ? '#FFD700' : 'none'} color={isFavorite ? '#FFD700' : '#666'} />
                </button>
                {isActive && <Check size={12} color="#fff" />}
            </div>
        )
    }

    const renderGroup = (provider: string, title: string, icon: React.ReactNode, models: ModelWithProvider[]) => {
        if (models.length === 0 && !searchQuery) return null
        if (models.length === 0) return null

        const isCollapsed = collapsedGroups[provider]

        return (
            <div style={{ marginBottom: '8px' }}>
                <div
                    className="group-header"
                    onClick={(e) => {
                        e.stopPropagation()
                        toggleGroup(provider)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 4px',
                        cursor: 'pointer',
                        color: '#b0b0b0',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        userSelect: 'none'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#e0e0e0'}
                    onMouseLeave={e => e.currentTarget.style.color = '#b0b0b0'}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ProviderLogo provider={provider} size={14} />
                        <span>{title}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.6, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '10px' }}>
                            {models.length}
                        </span>
                    </div>
                    <ChevronDown size={14} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </div>

                {!isCollapsed && (
                    <div className="model-group" style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                        {models.map(model => {
                            const isActive = settings.aiModel === model.code && settings.modelProvider === model.provider
                            return renderModelItem(model, isActive)
                        })}
                    </div>
                )}
            </div>
        )
    }

    // Render expanded grid view
    const renderExpandedView = () => {
        // Get all models organized by provider
        const providers = [
            { key: 'gemini', title: 'Gemini', icon: <Sparkles size={14} />, color: '#4dabf7' },
            { key: 'openrouter', title: 'OpenRouter', icon: <Cloud size={14} />, color: '#a855f7' },
            { key: 'perplexity', title: 'Perplexity', icon: <Globe size={14} />, color: '#22c55e' },
            { key: 'groq', title: 'Groq', icon: <Zap size={14} />, color: '#f97316' },
            { key: 'ollama', title: 'Ollama', icon: <Database size={14} />, color: '#339af0' },
            { key: 'codex', title: 'Codex', icon: <Cpu size={14} />, color: '#6366f1' }
        ]

        return (
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px',
                paddingRight: '4px'
            }}>
                {providers.map(provider => {
                    const models = groupedModels[provider.key as keyof typeof groupedModels]
                    if (models.length === 0) return null

                    return (
                        <div 
                            key={provider.key}
                            style={{ 
                                background: 'rgba(255,255,255,0.02)', 
                                borderRadius: '12px',
                                padding: '12px'
                            }}
                        >
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                marginBottom: '10px',
                                color: provider.color,
                                fontSize: '0.75rem', 
                                fontWeight: 600
                            }}>
                                {provider.icon}
                                {provider.title}
                                <span style={{ 
                                    fontSize: '0.65rem', 
                                    opacity: 0.6, 
                                    background: 'rgba(255,255,255,0.05)', 
                                    padding: '1px 5px', 
                                    borderRadius: '8px',
                                    marginLeft: 'auto'
                                }}>
                                    {models.length}
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {models.slice(0, 6).map(model => {
                                    const isActive = settings.aiModel === model.code && settings.modelProvider === provider.key
                                    return renderModelItem(model, isActive, false)
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={toggleOpen}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: minimal ? 'transparent' : 'rgba(255,255,255,0.05)',
                    border: minimal ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: minimal ? '6px 8px' : '6px 12px',
                    borderRadius: minimal ? '8px' : '12px',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    color: '#e0e0e0',
                    height: '100%'
                }}
                onMouseEnter={e => {
                    if (!minimal) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                    } else {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }
                }}
                onMouseLeave={e => {
                    if (!minimal) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    } else {
                        e.currentTarget.style.background = 'transparent'
                    }
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

            {/* Model Picker Overlay */}
            {isOpen && ReactDOM.createPortal(
                <div
                    ref={portalRef}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        transform: dropdownPos.showAbove ? 'translateY(-100%)' : 'translateY(0)',
                        width: isListExpanded ? '640px' : '360px',
                        maxHeight: dropdownPos.showAbove 
                            ? `${Math.max(200, Math.min(dropdownPos.top - 16, isListExpanded ? 520 : 480))}px`
                            : `${Math.max(200, Math.min(window.innerHeight - dropdownPos.top - 16, isListExpanded ? 520 : 480))}px`,
                        backgroundColor: '#1B1913',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '20px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        animation: dropdownPos.showAbove 
                            ? 'dropdown-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                            : 'dropdown-slide-down 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        backdropFilter: 'blur(20px)',
                        zIndex: 99999,
                        overflow: 'hidden'
                    }}
                >
                    {/* View Toggle */}
                    <div style={{
                        display: 'flex',
                        gap: '4px',
                        padding: '6px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '14px',
                        margin: '12px 16px 0'
                    }}>
                        <button
                            className={`view-tab ${viewMode === 'favorites' ? 'view-tab-active' : ''}`}
                            onClick={() => {
                                setViewMode('favorites')
                                setIsListExpanded(false)
                            }}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                borderRadius: '10px',
                                border: 'none',
                                background: viewMode === 'favorites' ? 'rgba(255,255,255,0.08)' : 'transparent',
                                color: viewMode === 'favorites' ? '#fff' : '#888',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            <Star size={14} fill={viewMode === 'favorites' ? '#FFD700' : 'none'} color={viewMode === 'favorites' ? '#FFD700' : '#888'} />
                            Favorites
                        </button>
                        <button
                            className={`view-tab ${viewMode === 'all' ? 'view-tab-active' : ''}`}
                            onClick={() => setViewMode('all')}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                borderRadius: '10px',
                                border: 'none',
                                background: viewMode === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
                                color: viewMode === 'all' ? '#fff' : '#888',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            <LayoutGrid size={14} color={viewMode === 'all' ? '#fff' : '#888'} />
                            All Models
                        </button>
                    </div>

                    {/* Expand/Collapse Button (only in All Models view) */}
                    {viewMode === 'all' && (
                        <button
                            className="expand-btn"
                            onClick={() => setIsListExpanded(!isListExpanded)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                margin: '8px 16px 0',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px',
                                color: '#888',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                alignSelf: 'flex-start'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                                e.currentTarget.style.color = '#fff'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                e.currentTarget.style.color = '#888'
                            }}
                        >
                            {isListExpanded ? <ChevronUp size={12} /> : <Expand size={12} />}
                            {isListExpanded ? 'Collapse' : 'Expand'}
                        </button>
                    )}

                    {/* Search - Only show in expanded view */}
                    {isListExpanded && viewMode === 'all' && (
                        <div style={{ position: 'relative', padding: '12px 16px 0' }}>
                            <Search size={14} color="#666" style={{ position: 'absolute', left: '28px', top: '24px', transform: 'translateY(-50%)' }} />
                            <input
                                className="search-input"
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
                    )}

                    {/* Content */}
                    <div 
                        className="custom-scrollbar tab-content"
                        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}
                    >
                        <div style={{ animation: viewMode === 'favorites' ? 'tabSwitchBack 0.2s var(--spring-back)' : 'tabSwitch 0.2s var(--spring-back)' }}>
                            {viewMode === 'favorites' ? (
                            // Favorites View
                            favoriteModels.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {favoriteModels.map(model => {
                                        const isActive = settings.aiModel === model.code && settings.modelProvider === model.provider
                                        return renderModelItem(model, isActive)
                                    })}
                                </div>
                            ) : (
                                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                                    <Star size={32} color="#444" style={{ marginBottom: '12px' }} />
                                    <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>No favorites yet</div>
                                    <div style={{ color: '#666', fontSize: '0.8rem' }}>Star models to add them here</div>
                                </div>
                            )
                        ) : (
                            // All Models View
                            isListExpanded ? (
                                // Expanded grid view
                                renderExpandedView()
                            ) : (
                                // Collapsed dropdown view
                                <>
                                    {renderGroup('ollama', 'Ollama', <Database size={14} />, groupedModels.ollama)}
                                    {renderGroup('perplexity', 'Perplexity', <Globe size={14} />, groupedModels.perplexity)}
                                    {renderGroup('openrouter', 'OpenRouter', <Cloud size={14} />, groupedModels.openrouter)}
                                    {renderGroup('gemini', 'Gemini', <Sparkles size={14} />, groupedModels.gemini)}
                                    {renderGroup('groq', 'Groq', <Zap size={14} />, groupedModels.groq)}
                                    {renderGroup('codex', 'Codex', <Cpu size={14} />, groupedModels.codex)}

                                    {filteredModels.length === 0 && (
                                        <div style={{ padding: '20px', textAlign: 'center', color: '#999999' }}>No models found</div>
                                    )}
                                </>
                            )
                        )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                /* Snappy Spring Animations */
                @keyframes dropdown-slide-up {
                    from { opacity: 0; transform: translateY(calc(-100% + 10px)); }
                    to { opacity: 1; transform: translateY(-100%); }
                }
                @keyframes dropdown-slide-down {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes starPop {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.4); }
                    100% { transform: scale(1); }
                }
                @keyframes ripple {
                    0% { transform: scale(0); opacity: 1; }
                    100% { transform: scale(2.5); opacity: 0; }
                }
                @keyframes tabSwitch {
                    0% { opacity: 0; transform: translateX(10px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                @keyframes tabSwitchBack {
                    0% { opacity: 0; transform: translateX(-10px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                
                /* Snappy spring curves */
                --spring-fast: cubic-bezier(0.25, 0.1, 0.25, 1);
                --spring-snappy: cubic-bezier(0.175, 0.885, 0.32, 1.275);
                --spring-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
                --spring-back: cubic-bezier(0.175, 0.885, 0.32, 1);

                .model-item {
                    transition: all 0.15s var(--spring-fast);
                }
                .model-item:hover {
                    transform: translateX(4px);
                }
                .model-item-active {
                    background: rgba(255,255,255,0.08) !important;
                    transform: translateX(6px);
                }
                .star-btn {
                    transition: all 0.15s var(--spring-snappy);
                }
                .star-btn:hover {
                    transform: scale(1.15);
                }
                .star-btn.favorited {
                    animation: starPop 0.25s var(--spring-bounce);
                }
                .view-tab {
                    transition: all 0.15s var(--spring-snappy);
                    position: relative;
                }
                .view-tab::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 50%;
                    width: 0;
                    height: 2px;
                    background: #FFD700;
                    transition: all 0.2s var(--spring-back);
                    transform: translateX(-50%);
                    border-radius: 2px;
                }
                .view-tab-active::after {
                    width: 60%;
                }
                .expand-btn {
                    transition: all 0.15s var(--spring-snappy);
                }
                .expand-btn:hover {
                    transform: scale(1.03);
                }
                .expand-btn:active {
                    transform: scale(0.97);
                }
                .group-header {
                    transition: all 0.15s var(--spring-fast);
                }
                .group-header:hover {
                    transform: translateX(4px);
                }
                .model-group {
                    animation: fadeIn 0.2s var(--spring-back);
                }
                .list-view-container {
                    animation: scaleIn 0.2s var(--spring-back);
                }
                .search-input {
                    transition: all 0.15s var(--spring-fast);
                }
                .search-input:focus {
                    border-color: rgba(255,255,255,0.2) !important;
                    box-shadow: 0 0 0 3px rgba(255,255,255,0.05);
                }
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; transition: background 0.15s; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .provider-row {
                    transition: all 0.15s var(--spring-fast);
                }
                .provider-row:hover {
                    background: rgba(255,255,255,0.04) !important;
                    transform: translateY(-2px);
                }
                .provider-row:active {
                    transform: translateY(0);
                }
                .compact-model-item {
                    transition: all 0.15s var(--spring-fast);
                }
                .compact-model-item:hover {
                    transform: translateX(3px);
                }
                .compact-model-item-active {
                    background: rgba(255,255,255,0.06) !important;
                }
            `}</style>
        </div>
    )
}
