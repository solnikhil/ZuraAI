import React, { useState, useRef, useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { ChevronDown, Check, Settings, Search, Sparkles, Zap, Brain, Box, MessageSquare, Image as ImageIcon, Eye, Star, Filter, ArrowLeft, Cpu, Cloud, Database, Globe } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'

interface ModelWithProvider {
    code: string
    displayName: string
    provider: 'ollama' | 'perplexity' | 'openrouter' | 'gemini' | 'groq'
}

export default function ModelSelector({ minimal }: { minimal?: boolean }) {
    const { settings, updateSettings } = useSettings()
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    // Collapse states for groups
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
        ollama: false,
        perplexity: false,
        openrouter: false,
        gemini: false,
        groq: false
    })

    const dropdownRef = useRef<HTMLDivElement>(null)
    const portalRef = useRef<HTMLDivElement>(null)
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 320, showAbove: true })

    // Update position when opening
    // Toggle handler to calculate position immediately
    const toggleOpen = () => {
        if (!isOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const dropdownHeight = 488 // Approximate height, will be adjusted after render
            const dropdownWidth = 320
            const padding = 16 // Minimum padding from viewport edges
            
            // Calculate available space above and below
            const spaceAbove = rect.top
            const spaceBelow = viewportHeight - rect.bottom
            
            // Determine if we should show above or below
            const showAbove = spaceAbove >= dropdownHeight + padding || spaceAbove > spaceBelow
            
            // Calculate vertical position
            let top: number
            if (showAbove) {
                top = rect.top - 12
            } else {
                top = rect.bottom + 12
            }
            
            // Calculate horizontal position (prevent overflow)
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
        return allModels
    }

    const allModels = useMemo(() => getAllModels(), [settings])

    // Helper component for Logo with fallback
    const ModelIcon = ({ model, icon, color, size = 24 }: any) => {
        const [imgError, setImgError] = useState(false)
        const provider = model.provider // Use provider instead of model code

        if (!imgError) {
            return (
                <img
                    src={`/provider-logos/${provider}.png`}
                    alt={model.displayName}
                    onError={() => setImgError(true)}
                    style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain', borderRadius: '4px' }}
                />
            )
        }

        // Fallback to Icon
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

    // Helper for Provider Logo (in headers)
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
        return null // Or a fallback icon
    }

    // Remove emojis from text
    const removeEmojis = (text: string): string => {
        // Remove emoji characters using Unicode ranges
        return text.replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
                   .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
                   .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
                   .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
                   .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
                   .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
                   .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
                   .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
                   .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
                   .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
                   .trim()
    }

    // Detect Model Family & Attributes (Recycled from previous step)
    const getModelAttributes = (model: ModelWithProvider) => {
        const code = model.code.toLowerCase()
        const name = model.displayName.toLowerCase()

        let icon = <MessageSquare size={16} />
        let color = '#b0b0b0'
        let badge = null

        // Icon Logic
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

    // Find current model - exact match only (both code and provider must match)
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
            groq: filteredModels.filter(m => m.provider === 'groq')
        }
    }, [filteredModels])

    // Recalculate position when dropdown opens or window resizes/scrolls
    useEffect(() => {
        if (!isOpen || !dropdownRef.current || !portalRef.current) return

        const updatePosition = () => {
            if (!dropdownRef.current || !portalRef.current) return
            
            const rect = dropdownRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const dropdownHeight = portalRef.current.offsetHeight || 488
            const dropdownWidth = 320
            const padding = 16
            
            // Calculate available space above and below
            const spaceAbove = rect.top
            const spaceBelow = viewportHeight - rect.bottom
            
            // Determine if we should show above or below
            const showAbove = spaceAbove >= dropdownHeight + padding || spaceAbove > spaceBelow
            
            // Calculate vertical position
            let top: number
            if (showAbove) {
                top = rect.top - 12
            } else {
                top = rect.bottom + 12
            }
            
            // Calculate horizontal position (prevent overflow)
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

        // Initial position update after render
        const timeoutId = setTimeout(updatePosition, 0)
        
        // Update on scroll/resize
        window.addEventListener('scroll', updatePosition, true)
        window.addEventListener('resize', updatePosition)
        
        return () => {
            clearTimeout(timeoutId)
            window.removeEventListener('scroll', updatePosition, true)
            window.removeEventListener('resize', updatePosition)
        }
    }, [isOpen])

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node
            // Check if click is outside both the trigger and the portal dropdown
            if (dropdownRef.current && !dropdownRef.current.contains(target) &&
                portalRef.current && !portalRef.current.contains(target)) {
                setIsOpen(false)
            }
        }
        // Use a small delay to allow click events to fire first
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 0)
        return () => {
            clearTimeout(timeoutId)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    const handleSelect = (model: ModelWithProvider, e?: React.MouseEvent) => {
        // Prevent event propagation to avoid closing dropdown before update
        if (e) {
            e.stopPropagation()
            e.preventDefault()
        }
        
        // #region agent log
        {(() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/Dashboard/ModelSelector.tsx:handleSelect',message:'Model selection triggered',data:{selectedModel:model.code,selectedProvider:model.provider,currentModel:settings.aiModel,currentProvider:settings.modelProvider},timestamp:Date.now(),sessionId:'debug-session',runId:'model-switcher-fix',hypothesisId:'A'})}).catch(()=>{}); } catch {} return null })()}
        // #endregion
        
        // Close dropdown first to prevent race conditions
        setIsOpen(false)
        
        // Update settings
        updateSettings({ aiModel: model.code, modelProvider: model.provider })
        
        // #region agent log
        {(() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/Dashboard/ModelSelector.tsx:handleSelect:after',message:'updateSettings called',data:{selectedModel:model.code,selectedProvider:model.provider},timestamp:Date.now(),sessionId:'debug-session',runId:'model-switcher-fix',hypothesisId:'A'})}).catch(()=>{}); } catch {} return null })()}
        // #endregion
    }

    const toggleGroup = (provider: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [provider]: !prev[provider]
        }))
    }

    const renderGroup = (provider: string, title: string, icon: React.ReactNode, models: ModelWithProvider[]) => {
        if (models.length === 0 && !searchQuery) return null // Hide empty groups if not searching (if searching, hiding is fine too)

        // If searching and no matches in group, hide it
        if (models.length === 0) return null

        const isCollapsed = collapsedGroups[provider]

        return (
            <div style={{ marginBottom: '8px' }}>
                <div
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {models.map(model => {
                            const { icon: attrIcon, color, badge } = getModelAttributes(model)
                            // Check if this model is active - exact match only
                            const isActive = settings.aiModel === model.code && settings.modelProvider === model.provider
                            return (
                                <div
                                    key={model.code}
                                    onClick={(e) => handleSelect(model, e)}
                                    onMouseDown={(e) => e.stopPropagation()} // Prevent dropdown from closing
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
                                            icon={attrIcon}
                                            color={color}
                                            size={20}
                                        />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{removeEmojis(model.displayName)}</span>
                                        {badge}
                                    </div>

                                    {isActive && <Check size={14} color="#fff" />}
                                </div>
                            )
                        })}
                    </div>
                )}
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

            {/* Rich Popover using Portal */}
            {isOpen && ReactDOM.createPortal(
                <div
                    ref={portalRef}
                    onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                    style={{
                        position: 'fixed',
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        transform: dropdownPos.showAbove ? 'translateY(-100%)' : 'translateY(0)',
                        width: '320px',
                        maxHeight: dropdownPos.showAbove 
                            ? `${Math.max(200, Math.min(dropdownPos.top - 16, 488))}px`
                            : `${Math.max(200, Math.min(window.innerHeight - dropdownPos.top - 16, 488))}px`,
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
                        zIndex: 99999, // High z-index to sit on top of everything
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
                    <div className="custom-scrollbar" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                        {renderGroup('ollama', 'Ollama', <Database size={14} />, groupedModels.ollama)}
                        {renderGroup('perplexity', 'Perplexity', <Globe size={14} />, groupedModels.perplexity)}
                        {renderGroup('openrouter', 'OpenRouter', <Cloud size={14} />, groupedModels.openrouter)}
                        {renderGroup('gemini', 'Gemini', <Sparkles size={14} />, groupedModels.gemini)}
                        {renderGroup('groq', 'Groq', <Zap size={14} />, groupedModels.groq)}

                        {filteredModels.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#999999' }}>No models found</div>
                        )}
                    </div>

                    {/* Backdrop for outside click (optional, but handling via global click is fine too) */}
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
                .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            `}</style>
        </div>
    )
}
