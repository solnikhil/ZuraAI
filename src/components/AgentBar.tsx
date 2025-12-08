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
}



export default function AgentBar({ onPromptSubmit, isSelectionMode, screenshot, onAttachScreenshot, onScreenshotClick, isChatActive, onViewScreenshot, onDetachScreenshot }: AgentBarProps) {
    const { settings, updateSettings } = useSettings();
    const [prompt, setPrompt] = useState('');
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isSelectionMode && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isSelectionMode]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (prompt.trim()) {
            onPromptSubmit(prompt);
            setPrompt('');
        }
    };

    const handleModelSelect = (modelCode: string) => {
        // Check if it's an OpenRouter model
        const isOpenRouter = (settings.configuredModels || []).find(m => m.code === modelCode);

        if (isOpenRouter) {
            updateSettings({ aiModel: modelCode, modelProvider: 'openrouter' });
        } else {
            // Assume Ollama
            updateSettings({ aiModel: modelCode, modelProvider: 'ollama' });
        }
        setShowModelDropdown(false);
    };

    // Get display name for current model
    const getCurrentModelName = () => {
        const allModels = [...(settings.configuredModels || []), ...(settings.ollamaModels || [])];
        const model = allModels.find(m => m.code === settings.aiModel);
        if (model) return model.displayName;

        // Fallback - show last part of model code
        const parts = settings.aiModel.split('/');
        return parts[parts.length - 1] || settings.aiModel;
    };

    return (
        <div
            className={`agent-bar-container ${isSelectionMode ? 'hidden' : ''} ${isChatActive ? 'chat-active' : ''}`}
            onMouseEnter={() => window.ipcRenderer.send('set-ignore-mouse-events', false)}
            onMouseLeave={() => window.ipcRenderer.send('set-ignore-mouse-events', true, { forward: true })}
        >
            <div className="agent-bar">
                <div className="agent-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#FF8C69" stroke="#FF8C69" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <button
                    type="button"
                    className="action-btn screenshot-btn"
                    onClick={onScreenshotClick}
                    title="Take Screenshot"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                </button>

                <form onSubmit={handleSubmit} className="agent-form">
                    <input
                        ref={inputRef}
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="What can I help you with today?"
                        className="agent-input"
                    />
                </form>

                {screenshot && (
                    <div
                        className="screenshot-preview"
                        onClick={onViewScreenshot}
                        style={{ cursor: 'pointer' }}
                        title="Click to view full size"
                    >
                        <img src={screenshot} alt="Screenshot" />
                        <div className="screenshot-badge">Attached</div>
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

                <div className="agent-controls">
                    <div
                        className="model-switcher"
                        ref={dropdownRef}
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"></path>
                        </svg>
                        <span className="current-model">{getCurrentModelName()}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 9l6 6 6-6" />
                        </svg>

                        {showModelDropdown && (
                            <div className="model-dropdown">
                                {(settings.configuredModels || []).length > 0 && (
                                    <>
                                        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cloud AI</div>
                                        {(settings.configuredModels || []).map(model => (
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
                                        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>Local AI</div>
                                        {(settings.ollamaModels || []).map(model => (
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5"></line>
                            <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
