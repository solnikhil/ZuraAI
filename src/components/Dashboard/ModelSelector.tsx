import React, { useState, useRef, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { ChevronDown, Check, Search, Zap, MessageSquare, Star, Cpu, Cloud, Database, Globe } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { getModelAttributes } from '../../utils/modelUtils'
import { removeEmojis } from '../../utils/textUtils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ModelWithProvider {
    code: string
    displayName: string
    provider: 'ollama' | 'perplexity' | 'openrouter' | 'groq'
}

type ViewMode = 'favorites' | 'all'

// Provider configuration
const providers = [
    { key: 'openrouter', title: 'OpenRouter', icon: <Cloud />, color: '#a855f7', logo: true },
    { key: 'perplexity', title: 'Perplexity', icon: <Globe />, color: '#22c55e', logo: true },
    { key: 'groq', title: 'Groq', icon: <Zap />, color: '#f97316', logo: true },
    { key: 'ollama', title: 'Ollama', icon: <Database />, color: '#339af0', logo: true },
] as const

export default function ModelSelector({ minimal }: { minimal?: boolean }) {
    const { settings, updateSettings } = useSettings()
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<ViewMode>('all')
    const [selectedProvider, setSelectedProvider] = useState(settings.modelProvider || 'openrouter')
    // Sync selectedProvider with settings.modelProvider when dropdown opens
    useEffect(() => {
        if (isOpen) {
            setSelectedProvider(settings.modelProvider || 'openrouter')
        }
    }, [isOpen, settings.modelProvider])

    const dropdownRef = useRef<HTMLDivElement>(null)
    const portalRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, showAbove: true })

    // Calculate dropdown position
    const calculatePosition = () => {
        if (!dropdownRef.current) return

        const rect = dropdownRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const viewportWidth = window.innerWidth
        const dropdownHeight = 484
        const dropdownWidth = 460
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
        // Keep dropdown aligned with trigger button
        if (left + dropdownWidth > viewportWidth - padding) {
            left = viewportWidth - dropdownWidth - padding
        }
        if (left < padding) {
            left = padding
        }
        
        // For electron apps, use document.body dimensions for better responsiveness
        const docWidth = document.body.clientWidth
        // Adjust for application bounds if in electron
        if (docWidth < viewportWidth) {
            left = Math.min(left, docWidth - dropdownWidth - padding)
        }
        
        setDropdownPos({
            top,
            left,
            showAbove
        })
    }

    // Toggle handler
    const toggleOpen = () => {
        if (!isOpen) {
            calculatePosition()
            setIsOpen(true)
        } else {
            setIsOpen(false)
        }
    }

    // Update position on window resize
    useEffect(() => {
        if (!isOpen) return

        const handleResize = () => {
            calculatePosition()
        }

        window.addEventListener('resize', handleResize)
        window.addEventListener('scroll', handleResize, true)

        return () => {
            window.removeEventListener('resize', handleResize)
            window.removeEventListener('scroll', handleResize, true)
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        const rafId = requestAnimationFrame(() => {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
        })

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            cancelAnimationFrame(rafId)
        }
    }, [isOpen])

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
        if (settings.groqModels) {
            settings.groqModels.forEach(m => allModels.push({ ...m, provider: 'groq' }))
        }
        return allModels
    }

    const allModels = useMemo(() => getAllModels(), [settings])

    // Get models for the selected provider
    const getCurrentModels = (): ModelWithProvider[] => {
        if (searchQuery.trim()) {
            // If searching, show all matching models
            return filteredModels
        }
        
        if (viewMode === 'favorites') {
            return favoriteModels
        }
        
        return allModels.filter(m => m.provider === selectedProvider)
    }

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
                {React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: size === 24 ? 20 : 14 })}
            </div>
        )
    }

    // Find current model
    const currentModel = allModels.find(m => m.code === settings.aiModel && m.provider === settings.modelProvider)
    const currentNameRaw = currentModel?.displayName || (settings.aiModel ? settings.aiModel.split('/').pop() : null) || 'Select Models...'
    const currentName = removeEmojis(currentNameRaw)

    // Filter Logic - combine local models with dynamically fetched OpenRouter models
    const filteredModels = useMemo(() => {
        if (!searchQuery.trim()) return allModels

        // First filter existing models
        const localFiltered = allModels.filter(m =>
            m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.code.toLowerCase().includes(searchQuery.toLowerCase())
        )

        return localFiltered
    }, [allModels, searchQuery])

    const handleSelect = (model: ModelWithProvider, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation()
            e.preventDefault()
        }
        setIsOpen(false)
        updateSettings({ aiModel: model.code, modelProvider: model.provider })
    }

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
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: isActive ? 'var(--theme-surface-hover)' : 'transparent',
                    border: isActive ? '1px solid var(--theme-border)' : '1px solid transparent',
                    cursor: 'pointer',
                    minWidth: 0,
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = 'var(--theme-surface-hover)'
                    const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
                    if (starBtn) starBtn.style.opacity = '1'
                }}
                onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                    const starBtn = e.currentTarget.querySelector('.star-btn') as HTMLElement
                    if (starBtn && !isFavorite) starBtn.style.opacity = '0'
                }}
            >
                {/* Provider Logo/Icon */}
                <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '8px', 
                    background: `linear-gradient(145deg, ${color}25, transparent)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden'
                }}>
                    <ModelIcon model={model} icon={<MessageSquare size={16} />} color={color} size={24} />
                </div>
                
                {/* Model Info */}
                <div style={{ 
                    flex: 1, 
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                }}>
                    <span style={{ 
                        fontSize: '0.85rem', 
                        color: isActive ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {removeEmojis(model.displayName)}
                    </span>
                    {/* Description placeholder - can be customized per model */}
                    <span style={{ 
                        fontSize: '0.7rem', 
                        color: 'var(--theme-text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        opacity: 0.7
                    }}>
                        {model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} model
                    </span>
                </div>
                
                {/* Active indicator or Favorite */}
                {isActive ? (
                    <Check size={14} color="var(--theme-accent)" />
                ) : (
                    <button
                        className={`star-btn ${isFavorite ? 'favorited' : ''}`}
                        onClick={(e) => toggleFavorite(model.code, e)}
                        style={{
                            opacity: isFavorite ? 1 : 0,
                            padding: '4px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFD700'
                        }}
                    >
                        <Star size={14} fill={isFavorite ? '#FFD700' : 'none'} />
                    </button>
                )}
            </div>
        )
    }

    return (
        <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={toggleOpen}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                title={minimal ? `${currentName} — ${settings.modelProvider || 'auto'}` : `${currentName} — ${settings.modelProvider || 'auto'}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    padding: minimal ? '6px' : '6px 12px',
                    borderRadius: '8px',
                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    color: '#e0e0e0',
                    width: minimal ? '32px' : 'auto',
                    height: '32px'
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                }}
            >
                {currentModel ? (
                    <ModelIcon
                        model={currentModel}
                        icon={getModelAttributes(currentModel).icon}
                        color={getModelAttributes(currentModel).color}
                        size={minimal ? 18 : 16}
                    />
                ) : <Cpu size={14} />}
                {!minimal && (
                    <>
                        <span
                            className="truncate"
                            style={{
                                maxWidth: '120px',
                                fontSize: '0.85rem',
                            }}
                        >
                            {currentName}
                        </span>
                        <ChevronDown size={14} style={{ opacity: 0.5, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </>
                )}
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
                        width: '460px',
                        height: '484px',
                        backgroundColor: 'var(--theme-surface)',
                        border: '1px solid var(--theme-border)',
                        borderRadius: '16px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        animation: dropdownPos.showAbove 
                            ? 'dropdown-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                            : 'dropdown-slide-down 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        zIndex: 99999,
                        overflow: 'hidden'
                    }}
                >
                    {/* Top: Search Bar with Line Separator */}
                    <div style={{ padding: '8px 16px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Search size={14} color="#666" />
                            <input
                                ref={searchInputRef}
                                className="search-input"
                                type="text"
                                placeholder="Search models..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    flex: 1,
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '6px 0',
                                    color: '#fff',
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                        {/* Line Separator */}
                        <div style={{
                            height: '1px',
                            background: 'rgba(255,255,255,0.06)',
                            marginTop: '8px'
                        }} />
                    </div>

                    {/* Two-column layout: Sidebar (left) + Models list (right) */}
                    <div style={{ 
                        display: 'flex', 
                        flex: 1, 
                        overflow: 'hidden',
                        padding: '8px 16px 16px',
                        position: 'relative'
                    }}>
                        {/* Left Sidebar with fade effect */}
                        <div style={{
                            width: '48px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            paddingRight: '10px',
                            borderRight: '1px solid rgba(255,255,255,0.06)',
                            position: 'relative',
                            zIndex: 2
                        }}>
                            {/* Left fade gradient */}
                            <div style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '20px',
                                background: 'linear-gradient(to right, var(--theme-surface) 0%, transparent 100%)',
                                pointerEvents: 'none'
                            }} />

                            {/* Favorites Icon */}
                            <button
                                onClick={() => setViewMode('favorites')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: viewMode === 'favorites' ? 'rgba(255,215,0,0.15)' : 'transparent',
                                    color: viewMode === 'favorites' ? '#FFD700' : '#666',
                                    cursor: 'pointer',
                                    marginBottom: '10px',
                                    position: 'relative',
                                    zIndex: 3
                                }}
                                onMouseEnter={e => {
                                    if (viewMode !== 'favorites') {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                        e.currentTarget.style.color = '#888'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (viewMode !== 'favorites') {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = '#666'
                                    }
                                }}
                            >
                                <Star size={16} fill={viewMode === 'favorites' ? '#FFD700' : 'none'} />
                            </button>

                            {/* Separator Line */}
                            <div style={{
                                width: '20px',
                                height: '1px',
                                background: 'rgba(255,255,255,0.1)',
                                marginBottom: '10px',
                                position: 'relative',
                                zIndex: 3
                            }} />

                            {/* Provider Logos */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                flex: 1,
                                position: 'relative',
                                zIndex: 2
                            }}>
                                {providers.map(provider => (
                                    <button
                                        key={provider.key}
                                        onClick={() => {
                                            setSelectedProvider(provider.key)
                                            setViewMode('all')
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: selectedProvider === provider.key 
                                                ? 'rgba(255,255,255,0.1)' 
                                                : 'transparent',
                                            color: selectedProvider === provider.key 
                                                ? '#fff' 
                                                : '#666',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            flexShrink: 0,
                                            position: 'relative',
                                            zIndex: 3
                                        }}
                                        onMouseEnter={e => {
                                            if (selectedProvider !== provider.key) {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                                e.currentTarget.style.color = '#888'
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (selectedProvider !== provider.key) {
                                                e.currentTarget.style.background = 'transparent'
                                                e.currentTarget.style.color = '#666'
                                            }
                                        }}
                                        title={provider.title}
                                    >
                                        {provider.logo ? (
                                            <img 
                                                src={`/provider-logos/${provider.key}.png`}
                                                alt={provider.title}
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement
                                                    target.style.display = 'none'
                                                    target.parentElement!.innerHTML = `<span style="font-size:14px">${provider.icon}</span>`
                                                }}
                                                style={{ 
                                                    width: '18px', 
                                                    height: '18px', 
                                                    objectFit: 'contain',
                                                    borderRadius: '4px'
                                                }} 
                                            />
                                        ) : (
                                            React.cloneElement(provider.icon as React.ReactElement<{ size?: number }>, { size: 16 })
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Right Side: Available Models with fade effect */}
                        <ScrollArea
                            className="custom-scrollbar"
                            style={{
                                flex: 1,
                                position: 'relative'
                            }}
                            viewportStyle={{ paddingLeft: '12px' }}
                        >
                            {/* Right fade gradient */}
                            <div style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: '30px',
                                background: 'linear-gradient(to left, var(--theme-surface) 0%, transparent 100%)',
                                pointerEvents: 'none',
                                zIndex: 1
                            }} />

                            {/* Header showing selected provider */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '10px',
                                position: 'relative',
                                zIndex: 2
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    color: '#fff',
                                    fontSize: '0.8rem',
                                    fontWeight: 600
                                }}>
                                    {viewMode === 'favorites' ? (
                                        <>
                                            <Star size={12} fill="#FFD700" color="#FFD700" />
                                            Favorites
                                        </>
                                    ) : (
                                        <>
                                            {(() => {
                                                const provider = providers.find(p => p.key === selectedProvider)
                                                if (provider) {
                                                    return (
                                                        <>
                                                            {provider.logo ? (
                                                                <img 
                                                                    src={`/provider-logos/${selectedProvider}.png`}
                                                                    alt={provider.title}
                                                                    onError={(e) => {
                                                                        const target = e.target as HTMLImageElement
                                                                        target.style.display = 'none'
                                                                    }}
                                                                    style={{ 
                                                                        width: '14px', 
                                                                        height: '14px', 
                                                                        objectFit: 'contain',
                                                                        borderRadius: '3px'
                                                                    }} 
                                                                />
                                                            ) : (
                                                                React.cloneElement(provider.icon as React.ReactElement<{ size?: number }>, { size: 12 })
                                                            )}
                                                            {provider.title}
                                                        </>
                                                    )
                                                }
                                                return null
                                            })()}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Models List */}
                            <div style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: '2px',
                                animation: 'fadeIn 0.2s ease',
                                position: 'relative',
                                zIndex: 2
                            }}>
                                {getCurrentModels().length > 0 ? (
                                    getCurrentModels().map(model => {
                                        const isActive = settings.aiModel === model.code && settings.modelProvider === model.provider
                                        return renderCompactModelItem(model, isActive)
                                    })
                                ) : (
                                    <div style={{ 
                                        padding: '24px 16px', 
                                        textAlign: 'center',
                                        color: '#666'
                                    }}>
                                        <Search size={20} style={{ opacity: 0.3, marginBottom: '8px' }} />
                                        <div style={{ fontSize: '0.8rem' }}>No models found</div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
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
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
