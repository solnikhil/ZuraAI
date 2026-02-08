import React, { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Zap, Image, Command } from './icons'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from './shared'
import { saveApiKeyToSecureStorage } from '../utils/secureApiKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import './Onboarding.css'

interface OnboardingProps {
    onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
    const [step, setStep] = useState(0)
    const { settings, updateSettings } = useSettings()
    const { showToast } = useToast()
    const [apiKey, setApiKey] = useState('')
    const [selectedProvider, setSelectedProvider] = useState<'openrouter' | 'perplexity' | 'gemini' | 'groq'>('openrouter')

    const validateApiKey = async (provider: string, key: string): Promise<boolean> => {
        try {
            if (provider === 'openrouter') {
                const response = await fetch('https://openrouter.ai/api/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                })
                return response.ok
            } else if (provider === 'perplexity') {
                const response = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'sonar',
                        messages: [{ role: 'user', content: 'test' }],
                        max_tokens: 1
                    })
                })
                return response.ok || response.status === 400 // 400 means auth worked but request was invalid
            } else if (provider === 'gemini') {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: 'test' }] }] })
                })
                return response.ok
            } else if (provider === 'groq') {
                const response = await fetch('https://api.groq.com/openai/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                })
                return response.ok
            }
            return false
        } catch {
            return false
        }
    }

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) {
            showToast('Please enter an API key', 'error')
            return
        }

        try {
            // Validate API key by making a test call
            const isValid = await validateApiKey(selectedProvider, apiKey)
            
            if (!isValid) {
                showToast('Invalid API key. Please check and try again.', 'error')
                return
            }

            // Save the API key to secure storage
            const trimmedKey = apiKey.trim()
            const updates: any = { modelProvider: selectedProvider }
            if (selectedProvider === 'openrouter') {
                await saveApiKeyToSecureStorage('openRouterApiKey', trimmedKey)
                updates.openRouterApiKey = trimmedKey
            } else if (selectedProvider === 'perplexity') {
                await saveApiKeyToSecureStorage('perplexityApiKey', trimmedKey)
                updates.perplexityApiKey = trimmedKey
            } else if (selectedProvider === 'gemini') {
                await saveApiKeyToSecureStorage('geminiApiKey', trimmedKey)
                updates.geminiApiKey = trimmedKey
            } else if (selectedProvider === 'groq') {
                await saveApiKeyToSecureStorage('groqApiKey', trimmedKey)
                updates.groqApiKey = trimmedKey
            }

            updateSettings(updates)
            showToast('API key saved successfully!', 'success')
            setStep(step + 1)
        } catch (error: any) {
            showToast(error.message || 'Failed to validate API key', 'error')
        }
    }

    const steps = [
        {
            title: 'Welcome to Zura AI',
            content: (
                <div className="onboarding-content">
                    <div className="onboarding-icon">✨</div>
                    <h2>Your AI Assistant is Ready</h2>
                    <p>Zura AI is a powerful desktop assistant that works alongside your workflow. Let's get you set up in just a few steps.</p>
                    <div className="feature-list">
                        <div className="feature-item">
                            <Zap size={20} />
                            <span>Fast keyboard shortcuts for chat and navigation</span>
                        </div>
                        <div className="feature-item">
                            <Image size={20} />
                            <span>Attach images and files for vision analysis</span>
                        </div>
                        <div className="feature-item">
                            <Command size={20} />
                            <span>Multiple AI providers supported</span>
                        </div>
                    </div>
                </div>
            )
        },
        {
            title: 'Set Up Your API Key',
            content: (
                <div className="onboarding-content">
                    <div className="onboarding-icon">🔑</div>
                    <h2>Choose Your AI Provider</h2>
                    <p>Select a provider to get started. You can add more later in Settings.</p>
                    
                    <div className="provider-selector">
                        <button
                            className={`provider-option ${selectedProvider === 'openrouter' ? 'active' : ''}`}
                            onClick={() => setSelectedProvider('openrouter')}
                        >
                            <div className="provider-header">
                                <span className="provider-name">OpenRouter</span>
                                <span className="provider-badge">Recommended</span>
                            </div>
                            <p className="provider-desc">Access 100+ AI models including GPT-4, Claude, Gemini</p>
                            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="provider-link">
                                Get API Key →
                            </a>
                        </button>

                        <button
                            className={`provider-option ${selectedProvider === 'perplexity' ? 'active' : ''}`}
                            onClick={() => setSelectedProvider('perplexity')}
                        >
                            <div className="provider-header">
                                <span className="provider-name">Perplexity</span>
                            </div>
                            <p className="provider-desc">Real-time web search powered AI responses</p>
                            <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noopener noreferrer" className="provider-link">
                                Get API Key →
                            </a>
                        </button>

                        <button
                            className={`provider-option ${selectedProvider === 'gemini' ? 'active' : ''}`}
                            onClick={() => setSelectedProvider('gemini')}
                        >
                            <div className="provider-header">
                                <span className="provider-name">Google Gemini</span>
                            </div>
                            <p className="provider-desc">Google's powerful AI models with vision support</p>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="provider-link">
                                Get API Key →
                            </a>
                        </button>

                        <button
                            className={`provider-option ${selectedProvider === 'groq' ? 'active' : ''}`}
                            onClick={() => setSelectedProvider('groq')}
                        >
                            <div className="provider-header">
                                <span className="provider-name">Groq</span>
                            </div>
                            <p className="provider-desc">Ultra-fast inference with Llama models</p>
                            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="provider-link">
                                Get API Key →
                            </a>
                        </button>
                    </div>

                    <div className="api-key-input space-y-3">
                        <Label>Paste your API key here:</Label>
                        <Input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="bg-secondary border-border"
                        />
                        <Button
                            onClick={handleSaveApiKey}
                            disabled={!apiKey.trim()}
                            className="w-full"
                        >
                            Save & Continue
                        </Button>
                    </div>
                </div>
            )
        },
        {
            title: 'Keyboard Shortcuts',
            content: (
                <div className="onboarding-content">
                    <div className="onboarding-icon">⌨️</div>
                    <h2>Master the Shortcuts</h2>
                    <p>These shortcuts will help you access Zura instantly from anywhere.</p>
                    
                    <div className="shortcuts-list">
                        <div className="shortcut-item">
                            <kbd>Ctrl</kbd> + <kbd>N</kbd>
                            <span>Start new chat</span>
                        </div>
                        <div className="shortcut-item">
                            <kbd>Ctrl</kbd> + <kbd>Space</kbd>
                            <span>Toggle command bar</span>
                        </div>
                        <div className="shortcut-item">
                            <kbd>Enter</kbd>
                            <span>Send message</span>
                        </div>
                        <div className="shortcut-item">
                            <kbd>Shift</kbd> + <kbd>Enter</kbd>
                            <span>New line in message</span>
                        </div>
                    </div>

                    <div className="tip-box">
                        <p><strong>Tip:</strong> Use Cmd instead of Ctrl on macOS.</p>
                    </div>
                </div>
            )
        },
        {
            title: "You're All Set!",
            content: (
                <div className="onboarding-content">
                    <div className="onboarding-icon">🎉</div>
                    <h2>Ready to Go!</h2>
                    <p>Zura AI is now configured and ready to use. Start chatting in the dashboard.</p>
                    
                    <div className="quick-tips">
                        <h3>Quick Tips:</h3>
                        <ul>
                            <li>Paste images or files directly into the chat input</li>
                            <li>Press Ctrl+N to start a fresh conversation quickly</li>
                            <li>Access Settings from the sidebar anytime</li>
                            <li>Your chat history is saved automatically</li>
                        </ul>
                    </div>

                    <Button onClick={onComplete} className="w-full">
                        Start Using Zura
                    </Button>
                </div>
            )
        }
    ]

    const currentStep = steps[step]
    const isFirstStep = step === 0
    const isLastStep = step === steps.length - 1

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-modal">
                <div className="onboarding-header">
                    <Progress
                        value={((step + 1) / steps.length) * 100}
                        className="h-1.5 bg-white/10"
                        indicatorClassName="bg-[var(--theme-accent)]"
                    />
                    <button className="close-btn" onClick={onComplete}>
                        <X size={20} />
                    </button>
                </div>

                <div className="onboarding-body">
                    <h1>{currentStep.title}</h1>
                    {currentStep.content}
                </div>

                <div className="onboarding-footer">
                    {!isFirstStep && (
                        <Button variant="outline" onClick={() => setStep(step - 1)}>
                            <ChevronLeft size={18} className="mr-1" />
                            Back
                        </Button>
                    )}
                    <div style={{ flex: 1 }} />
                    {!isLastStep && step !== 1 && (
                        <Button onClick={() => setStep(step + 1)}>
                            Next
                            <ChevronRight size={18} className="ml-1" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
