import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import './AgentBar.css';

interface AgentBarProps {
    onPromptSubmit: (prompt: string) => void;
    isSelectionMode: boolean;
    screenshot: string | null;
    onAttachScreenshot: () => void;
    onScreenshotClick: () => void;
    isChatActive: boolean;
    onViewScreenshot?: () => void;
    onDetachScreenshot?: () => void;
    onNewChat?: () => void;
}

export default function AgentBar({ onPromptSubmit, isSelectionMode, screenshot, onAttachScreenshot, onScreenshotClick, isChatActive, onViewScreenshot, onDetachScreenshot, onNewChat }: AgentBarProps) {
    const { settings, updateSettings } = useSettings();
    const [prompt, setPrompt] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [expandedSections, setExpandedSections] = useState({ openrouter: true, ollama: true });
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const collapseTimeout = useRef<NodeJS.Timeout | null>(null);
    const hasInteracted = useRef(false);

    // Sync expanded state with chat active state
    useEffect(() => {
        if (isChatActive && hasInteracted.current) {
            setIsExpanded(true);
        }
    }, [isChatActive]);

    // Auto-expand when screenshot is captured
    useEffect(() => {
        if (screenshot) {
            hasInteracted.current = true;
            setIsExpanded(true);
        }
    }, [screenshot]);

    // Handle focus loss (click outside or window blur)
    useEffect(() => {
        const handleCollapse = () => {
            if (!isChatActive && !screenshot) {
                if (collapseTimeout.current) clearTimeout(collapseTimeout.current);
                collapseTimeout.current = setTimeout(() => {
                    setIsExpanded(false);
                    hasInteracted.current = false;
                }, 1000);
            }
        };

        const handleCancelCollapse = () => {
            if (collapseTimeout.current) {
                clearTimeout(collapseTimeout.current);
                collapseTimeout.current = null;
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            // Dropdown logic
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }

            // Auto-collapse logic
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                handleCollapse();
            } else {
                handleCancelCollapse();
            }
        };

        const handleWindowBlur = () => {
            handleCollapse();
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('blur', handleWindowBlur);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('blur', handleWindowBlur);
            if (collapseTimeout.current) clearTimeout(collapseTimeout.current);
        };
    }, [isChatActive, screenshot]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (prompt.trim()) {
            hasInteracted.current = true;
            setIsExpanded(true);
            onPromptSubmit(prompt);
            setPrompt('');
        }
    };

    const handleInputClick = () => {
        hasInteracted.current = true;
        setIsExpanded(true);
    };

    const handleModelSelect = (modelCode: string) => {
        const isOpenRouter = (settings.configuredModels || []).find(m => m.code === modelCode);
        if (isOpenRouter) {
            updateSettings({ aiModel: modelCode, modelProvider: 'openrouter' });
        } else {
            updateSettings({ aiModel: modelCode, modelProvider: 'ollama' });
        }
        setShowModelDropdown(false);
    };

    const toggleSection = (section: 'openrouter' | 'ollama', e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const getCurrentModelName = () => {
        const allModels = [...(settings.configuredModels || []), ...(settings.ollamaModels || [])];
        const model = allModels.find(m => m.code === settings.aiModel);
        if (model) return model.displayName;
        const parts = settings.aiModel.split('/');
        return parts[parts.length - 1] || settings.aiModel;
    };

    const handleNewChat = () => {
        setIsExpanded(false);
        onNewChat?.();
    };

    return (
        <div
            ref={containerRef}
            className={`agent-bar-container ${isSelectionMode ? 'hidden' : ''} ${isExpanded ? 'expanded' : 'collapsed'} ${isChatActive ? 'chat-active' : ''}`}
            onMouseEnter={() => window.ipcRenderer.send('set-ignore-mouse-events', false)}
            onMouseLeave={() => window.ipcRenderer.send('set-ignore-mouse-events', true, { forward: true })}
        >
            <div className="agent-bar">
                {/* Logo - always visible */}
                <div
                    className="agent-icon"
                    onClick={handleNewChat}
                    title="Start New Chat"
                >
                    <img
                        src="/icon.png"
                        alt="New Chat"
                    />
                </div>

                {/* Screenshot button - always visible */}
                <button
                    type="button"
                    className="action-btn screenshot-btn"
                    onClick={onScreenshotClick}
                    title="Take Screenshot"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                </button>

                {/* Input form - always visible */}
                <form onSubmit={handleSubmit} className="agent-form">
                    <input
                        ref={inputRef}
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onClick={handleInputClick}
                        placeholder={isExpanded ? "What can I help you with today?" : "Ask Zura..."}
                        className="agent-input"
                    />
                </form>

                {/* Screenshot preview - only when expanded and has screenshot */}
                {isExpanded && screenshot && (
                    <div
                        className="screenshot-preview"
                        onClick={onViewScreenshot}
                        title="Click to view full size"
                    >
                        <img src={screenshot} alt="Screenshot" />
                        <div className="screenshot-badge">📎</div>
                        <button
                            className="detach-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDetachScreenshot?.();
                            }}
                            title="Remove attachment"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* Expanded controls - model switcher & submit */}
                {isExpanded && (
                    <div className="agent-controls">
                        <div
                            className="model-switcher"
                            ref={dropdownRef}
                            onClick={() => setShowModelDropdown(!showModelDropdown)}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"></path>
                            </svg>
                            <span className="current-model">{getCurrentModelName()}</span>
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9l6 6 6-6" />
                            </svg>

                            {showModelDropdown && (
                                <div className="model-dropdown">
                                    {(settings.configuredModels || []).length > 0 && (
                                        <>
                                            <div
                                                className="model-section-label"
                                                onClick={(e) => toggleSection('openrouter', e)}
                                            >
                                                <span>OpenRouter</span>
                                                <svg
                                                    width="10"
                                                    height="10"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{
                                                        transform: expandedSections.openrouter ? 'rotate(180deg)' : 'rotate(0deg)',
                                                        transition: 'transform 0.2s ease'
                                                    }}
                                                >
                                                    <path d="M6 9l6 6 6-6" />
                                                </svg>
                                            </div>
                                            {expandedSections.openrouter && (settings.configuredModels || []).map(model => (
                                                <div
                                                    key={model.code}
                                                    className={`model-option ${settings.aiModel === model.code ? 'active' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleModelSelect(model.code);
                                                    }}
                                                >
                                                    <span className="model-name">{model.displayName}</span>
                                                    {settings.aiModel === model.code && (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    )}
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {(settings.ollamaModels || []).length > 0 && (
                                        <>
                                            <div
                                                className="model-section-label"
                                                style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}
                                                onClick={(e) => toggleSection('ollama', e)}
                                            >
                                                <span>Ollama</span>
                                                <svg
                                                    width="10"
                                                    height="10"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{
                                                        transform: expandedSections.ollama ? 'rotate(180deg)' : 'rotate(0deg)',
                                                        transition: 'transform 0.2s ease'
                                                    }}
                                                >
                                                    <path d="M6 9l6 6 6-6" />
                                                </svg>
                                            </div>
                                            {expandedSections.ollama && (settings.ollamaModels || []).map(model => (
                                                <div
                                                    key={model.code}
                                                    className={`model-option ${settings.aiModel === model.code ? 'active' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleModelSelect(model.code);
                                                    }}
                                                >
                                                    <span className="model-name">{model.displayName}</span>
                                                    {settings.aiModel === model.code && (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    )}
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <button type="submit" className="submit-btn" onClick={handleSubmit} disabled={!prompt.trim()}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </button>
                    </div>
                )}

                {/* Collapsed submit button */}
                {!isExpanded && (
                    <button type="submit" className="submit-btn compact" onClick={handleSubmit} disabled={!prompt.trim()}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5"></line>
                            <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}
