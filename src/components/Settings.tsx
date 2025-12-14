import React, { useState, useEffect, useMemo } from 'react'
import { useSettings, TodoItem } from '../contexts/SettingsContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'
import { Crown, Zap, RefreshCw, Check, Edit2, Plus, Trash2, Brain, Eye, EyeOff, RotateCcw, MessageSquare, Clock, Cpu, Box, Sparkles, HardDrive, TrendingUp, Image as ImageIcon, BarChart, AlignLeft, CheckSquare, Square, ListTodo } from 'lucide-react'
import { motion } from 'framer-motion'
import './Settings.css'

interface SettingsProps {
    activeSection?: string
    onUnsavedChange?: (hasChanges: boolean) => void
    showWarning?: boolean
}

export default function Settings({ activeSection = 'usage', onUnsavedChange, showWarning = false }: SettingsProps) {
    const { settings, updateSettings, resetSettings } = useSettings()
    const { sessions } = useChatHistory()
    const [pendingSettings, setPendingSettings] = useState(settings)

    // UI States
    const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
    const [showPerplexityKey, setShowPerplexityKey] = useState(false)
    const [showGeminiKey, setShowGeminiKey] = useState(false)
    const [showGroqKey, setShowGroqKey] = useState(false)

    // Ollama
    const [isOllamaConnected, setIsOllamaConnected] = useState(false)
    const [isCheckingOllama, setIsCheckingOllama] = useState(false)

    // Model Editing
    const [newModelCode, setNewModelCode] = useState('')
    const [newModelName, setNewModelName] = useState('')
    const [editingIndex, setEditingIndex] = useState<number | null>(null)
    const [editCode, setEditCode] = useState('')
    const [editName, setEditName] = useState('')

    // Activity Graph State
    const [graphRange, setGraphRange] = useState<'7d' | '30d' | '12m'>('7d')
    const [hoverX, setHoverX] = useState<number | null>(null) // 0-1 percentage across graph
    const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null) // Raw pixel position in container

    const usageStats = useMemo(() => {
        const now = Date.now()
        const todayStart = new Date().setHours(0, 0, 0, 0)

        let totalMessages = 0
        let totalTokens = 0
        let todayMessages = 0

        // --- 1. General Stats (Totals) ---
        sessions.forEach(session => {
            session.messages.forEach(msg => {
                totalMessages++
                if (msg.usage) {
                    totalTokens += msg.usage.totalTokens || 0
                }
                if (msg.timestamp >= todayStart) {
                    todayMessages++
                }
            })
        })

        // --- 2. Activity Data Calculation ---
        let activityData: { label: string, value: number }[] = []
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        if (graphRange === '7d') {
            // Last 7 days
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now - i * 24 * 60 * 60 * 1000)
                activityData.push({ label: days[d.getDay()], value: 0 })
            }
            sessions.forEach(session => {
                session.messages.forEach(msg => {
                    const diffTime = now - msg.timestamp
                    const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000))
                    if (diffDays >= 0 && diffDays < 7) {
                        activityData[6 - diffDays].value++
                    }
                })
            })
        } else if (graphRange === '30d') {
            // Last 30 days
            for (let i = 29; i >= 0; i--) {
                const d = new Date(now - i * 24 * 60 * 60 * 1000)
                // Show Day number
                activityData.push({ label: d.getDate().toString(), value: 0 })
            }
            sessions.forEach(session => {
                session.messages.forEach(msg => {
                    const diffTime = now - msg.timestamp
                    const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000))
                    if (diffDays >= 0 && diffDays < 30) {
                        activityData[29 - diffDays].value++
                    }
                })
            })
        } else if (graphRange === '12m') {
            // Last 12 months
            const currentMonth = new Date().getMonth()
            for (let i = 11; i >= 0; i--) {
                const mIndex = (currentMonth - i + 12) % 12
                activityData.push({ label: months[mIndex], value: 0 })
            }
            const oneYearAgo = new Date()
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

            sessions.forEach(session => {
                session.messages.forEach(msg => {
                    if (msg.timestamp >= oneYearAgo.getTime()) {
                        const msgDate = new Date(msg.timestamp)
                        // Calculate month difference
                        const monthDiff = (new Date().getFullYear() - msgDate.getFullYear()) * 12 + (new Date().getMonth() - msgDate.getMonth())
                        if (monthDiff >= 0 && monthDiff < 12) {
                            activityData[11 - monthDiff].value++
                        }
                    }
                })
            })
        }

        // --- 3. Most used model & Images ---
        let maxModel = 'N/A'
        let maxCount = 0
        const modelCounts: Record<string, number> = {}
        let imagesProcessed = 0
        let assistantMsgCount = 0
        let totalAssistantChars = 0

        sessions.forEach(session => {
            session.messages.forEach(msg => {
                if (msg.role === 'assistant') {
                    assistantMsgCount++
                    totalAssistantChars += msg.content.length
                    if (msg.model) {
                        const mName = msg.model.split('/').pop() || msg.model
                        modelCounts[mName] = (modelCounts[mName] || 0) + 1
                        if (modelCounts[mName] > maxCount) {
                            maxCount = modelCounts[mName]
                            maxModel = mName
                        }
                    }
                }
                if (msg.image) {
                    imagesProcessed++
                }
            })
        })

        return {
            totalSessions: sessions.length,
            totalMessages,
            totalTokens,
            todayMessages,
            last7DaysData: [], // Placeholder if needed
            activityData,
            storageUsed: Math.round((totalMessages * 500) / 1024),
            avgTokens: totalMessages > 0 ? Math.round(totalTokens / totalMessages) : 0,
            mostUsedModel: maxModel,
            imagesProcessed,
            avgResponseLength: assistantMsgCount > 0 ? Math.round(totalAssistantChars / assistantMsgCount) : 0
        }
    }, [sessions, graphRange])


    useEffect(() => {
        setPendingSettings(settings)
    }, [settings])

    const handleChange = (changes: Partial<typeof settings>) => {
        setPendingSettings(prev => ({ ...prev, ...changes }))
    }

    const saveChanges = () => updateSettings(pendingSettings)
    const cancelChanges = () => setPendingSettings(settings)
    const hasChanges = JSON.stringify(pendingSettings) !== JSON.stringify(settings)

    // Notify parent about unsaved changes
    useEffect(() => {
        onUnsavedChange?.(hasChanges)
    }, [hasChanges, onUnsavedChange])

    // --- Ollama Helpers ---
    const checkOllama = async () => {
        setIsCheckingOllama(true)
        const connected = await checkOllamaStatus(pendingSettings.ollamaUrl)
        setIsOllamaConnected(connected)
        if (connected) {
            const models = await listOllamaModels(pendingSettings.ollamaUrl)
            if (models.length > 0) {
                const formatted = models.map(m => ({
                    code: m.name,
                    displayName: `${m.name} (${m.details.parameter_size})`
                }))
                handleChange({ ollamaModels: formatted })
            }
        }
        setIsCheckingOllama(false)
    }

    useEffect(() => {
        if (pendingSettings.modelProvider === 'ollama') {
            checkOllama()
        }
    }, [])

    // --- Model Management ---
    const addModel = () => {
        if (newModelCode && newModelName) {
            const updated = [...(pendingSettings.configuredModels || []), { code: newModelCode, displayName: newModelName }]
            handleChange({ configuredModels: updated })
            setNewModelCode('')
            setNewModelName('')
        }
    }

    const deleteModel = (index: number) => {
        const updated = pendingSettings.configuredModels.filter((_: any, i: number) => i !== index)
        handleChange({ configuredModels: updated })
    }

    const startEdit = (index: number) => {
        const model = pendingSettings.configuredModels[index]
        setEditingIndex(index)
        setEditCode(model.code)
        setEditName(model.displayName)
    }

    const saveEdit = () => {
        if (editingIndex !== null && editCode && editName) {
            const updated = [...pendingSettings.configuredModels]
            updated[editingIndex] = { code: editCode, displayName: editName }
            handleChange({ configuredModels: updated })
            setEditingIndex(null)
        }
    }

    const resetSystemPrompt = () => {
        // Reset to default system prompt
        handleChange({
            systemPrompt: `The assistant is Zura, created by iNinjaOP.

Zura's knowledge base was last updated in January 2025. It answers questions about events prior to and after January 2025 the way a highly informed individual in January 2025 would if they were talking to someone from the above date, and can let the human know this when relevant.

Zura cannot open URLs, links, or videos. If it seems like the user is expecting Zura to do so, it clarifies the situation and asks the human to paste the relevant text or image content directly into the conversation.

If it is asked to assist with tasks involving the expression of views held by a significant number of people, Zura provides assistance with the task regardless of its own views. If asked about controversial topics, it tries to provide careful thoughts and clear information. Zura presents the requested information without explicitly saying that the topic is sensitive, and without claiming to be presenting objective facts.

When presented with a math problem, logic problem, or other problem benefiting from systematic thinking, Zura thinks through it step by step before giving its final answer.

If Zura is asked about a very obscure person, object, or topic, i.e. if it is asked for the kind of information that is unlikely to be found more than once or twice on the internet, Zura ends its response by reminding the user that although it tries to be accurate, it may hallucinate in response to questions like this. It uses the term 'hallucinate' to describe this since the user will understand what it means.

If Zura mentions or cites particular articles, papers, or books, it always lets the human know that it doesn't have access to search or a database and may hallucinate citations, so the human should double check its citations.

Zura is intellectually curious. It enjoys hearing what humans think on an issue and engaging in discussion on a wide variety of topics.

Zura uses markdown for code.

Zura is happy to engage in conversation with the human when appropriate. Zura engages in authentic conversation by responding to the information provided, asking specific and relevant questions, showing genuine curiosity, and exploring the situation in a balanced way without relying on generic statements.

Zura avoids peppering the human with questions and tries to only ask the single most relevant follow-up question when it does ask a follow up. Zura doesn't always end its responses with a question.

Zura is always sensitive to human suffering, and expresses sympathy, concern, and well wishes for anyone it finds out is ill, unwell, suffering, or has passed away.

Zura avoids using rote words or phrases or repeatedly saying things in the same or similar ways. It varies its language just as one would in a conversation.

Zura provides thorough responses to more complex and open-ended questions or to anything where a long response is requested, but concise responses to simpler questions and tasks.

Zura is happy to help with analysis, question answering, math, coding, creative writing, teaching, role-play, general discussion, and all sorts of other tasks.

If the human says they work for a specific company, including AI labs, Zura can help them with company-related tasks even though Zura cannot verify what company they work for.

Zura can engage with fiction, creative writing, and roleplaying. It can take on the role of a fictional character in a story, and it can engage in creative or fanciful scenarios that don't reflect reality.

If asked for a very long task that cannot be completed in a single response, Zura offers to do the task piecemeal and get feedback from the human as it completes each part of the task.

Zura responds directly to all human messages without unnecessary affirmations or filler phrases like "Certainly!", "Of course!", "Absolutely!", "Great!", "Sure!", etc. Zura follows this instruction and starts responses directly with the requested content or a brief contextual framing, without these introductory affirmations.

Zura never includes generic safety warnings unless asked for. It is fine to be helpful and truthful without adding safety warnings.` })
    }


    return (
        <div className="settings-container" style={{ borderRadius: 24, margin: '16px 16px 16px 0', border: '1px solid rgba(255,255,255,0.06)', background: '#0a0a0a', overflow: 'hidden', position: 'relative', height: 'calc(100vh - 32px)' }}>
            <div className="settings-main-col" style={{ padding: '0', overflowY: 'auto', height: '100%', paddingBottom: hasChanges ? 80 : 0, maxWidth: '100%' }}>
                <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto', padding: '0 24px', transition: 'max-width 0.3s ease' }}>

                    {/* ========== USAGE SECTION ========== */}
                    {activeSection === 'usage' && (
                        <div style={{ padding: '40px' }}>
                            <div className="page-header">
                                <h2 className="page-title">Usage Statistics</h2>
                                <div className="page-subtitle">Track your chat activity and token usage</div>
                            </div>

                            {/* Top Stats */}
                            <div className="usage-stats-row">
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Today</span>
                                        <MessageSquare size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.todayMessages}</div>
                                    <div className="stat-subtext">Messages sent</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Total Sessions</span>
                                        <Clock size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.totalSessions}</div>
                                    <div className="stat-subtext">Chat conversations</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Total Messages</span>
                                        <Zap size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.totalMessages}</div>
                                    <div className="stat-subtext">All time</div>
                                </div>
                            </div>

                            {/* Secondary Stats Row */}
                            <div className="usage-stats-row" style={{ marginTop: '16px' }}>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Avg. Tokens / Msg</span>
                                        <TrendingUp size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.avgTokens}</div>
                                    <div className="stat-subtext">Complexity rating</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Est. Storage</span>
                                        <HardDrive size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.storageUsed} KB</div>
                                    <div className="stat-subtext">Local data size</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="stat-label">Images Processed</span>
                                        <ImageIcon size={14} color="#666" />
                                    </div>
                                    <div className="stat-value">{usageStats.imagesProcessed}</div>
                                    <div className="stat-subtext">Visual queries</div>
                                </div>
                            </div>

                            {/* Most Used Model (Full Width) */}
                            <div className="limits-section" style={{ marginTop: 16 }}>
                                <div className="limit-item">
                                    <div className="limit-header">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <BarChart size={14} /> Most Used Model
                                        </span>
                                        <span>{usageStats.mostUsedModel}</span>
                                    </div>
                                    <div className="limit-footer" style={{ marginTop: 8 }}>
                                        <span>Favorite AI</span>
                                        <span>Usage count: {Math.max(...Object.values(sessions.flatMap(s => s.messages).reduce((acc, msg) => {
                                            if (msg.role === 'assistant' && msg.model) {
                                                const mName = msg.model.split('/').pop() || msg.model
                                                acc[mName] = (acc[mName] || 0) + 1
                                            }
                                            return acc
                                        }, {} as Record<string, number>)) || [0])}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Token Usage */}
                            <div className="limits-section" style={{ marginTop: 24 }}>
                                <div className="limit-item">
                                    <div className="limit-header">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Cpu size={14} /> Total Tokens Used
                                        </span>
                                        <span>{usageStats.totalTokens.toLocaleString()}</span>
                                    </div>
                                    <div className="limit-footer" style={{ marginTop: 8 }}>
                                        <span>Lifetime usage</span>
                                        <span>Self-hosted (no limits)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Activity Graph */}
                            <div className="activity-section" style={{ marginTop: 24 }}>
                                <div className="activity-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="stat-label" style={{ fontSize: '1rem', fontWeight: 600, color: '#e0e0e0' }}>Activity</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 0, background: '#1a1a1a', padding: 2, borderRadius: 8, border: '1px solid #333' }}>
                                        {['7d', '30d', '12m'].map((range) => (
                                            <button
                                                key={range}
                                                onClick={() => setGraphRange(range as any)}
                                                style={{
                                                    padding: '4px 12px',
                                                    fontSize: '0.75rem',
                                                    borderRadius: 6,
                                                    background: graphRange === range ? '#FFE4C4' : 'transparent',
                                                    color: graphRange === range ? '#000' : '#888',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {range}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{
                                    minHeight: 380,
                                    width: '100%',
                                    position: 'relative',
                                    background: 'linear-gradient(180deg, rgba(255,228,196,0.04) 0%, rgba(0,0,0,0) 100%), linear-gradient(180deg, #0d0d10 0%, #090909 100%)',
                                    border: '1px solid #1f1f1f',
                                    borderRadius: 18,
                                    padding: 18,
                                    paddingTop: 36,
                                    boxSizing: 'border-box',
                                    overflow: 'hidden',
                                    boxShadow: '0 24px 64px rgba(0,0,0,0.4)'
                                }}>
                                    {(() => {
                                        const data = usageStats.activityData
                                        const rawValues = data.map(d => d.value)

                                        // Use raw values directly - no smoothing needed for accurate representation
                                        const maxValue = Math.max(...rawValues, 1)
                                        const max = maxValue * 1.15
                                        const width = 1100
                                        const height = 320
                                        const paddingX = 28
                                        const paddingY = 22

                                        // Direct coordinate calculation from data points
                                        const getCoords = (val: number, idx: number) => {
                                            const x = paddingX + (idx / Math.max(1, data.length - 1)) * (width - 2 * paddingX)
                                            const y = height - paddingY - (Math.max(0, val) / max) * (height - 2 * paddingY)
                                            return { x, y }
                                        }

                                        // Build smooth path using quadratic Bezier curves through actual data points
                                        let lineD = ''
                                        let areaD = ''

                                        if (data.length > 0) {
                                            const points = rawValues.map((v, i) => getCoords(v, i))

                                            // Start the path
                                            lineD = `M ${points[0].x} ${points[0].y}`

                                            if (points.length === 1) {
                                                // Single point - just a dot, extend as a line
                                                lineD = `M ${paddingX} ${points[0].y} L ${width - paddingX} ${points[0].y}`
                                            } else if (points.length === 2) {
                                                // Two points - simple line
                                                lineD = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
                                            } else {
                                                // Multiple points - use smooth quadratic curves
                                                for (let i = 1; i < points.length; i++) {
                                                    const prev = points[i - 1]
                                                    const curr = points[i]

                                                    // Use midpoint control for smooth curve
                                                    const midX = (prev.x + curr.x) / 2
                                                    const midY = (prev.y + curr.y) / 2

                                                    if (i === 1) {
                                                        // First segment: quadratic to midpoint
                                                        lineD += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`
                                                    } else if (i === points.length - 1) {
                                                        // Last segment: curve through to final point
                                                        lineD += ` Q ${prev.x} ${prev.y} ${curr.x} ${curr.y}`
                                                    } else {
                                                        // Middle segments: smooth through midpoints
                                                        lineD += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`
                                                    }
                                                }
                                            }

                                            // Create area path by closing to bottom
                                            const lastPoint = points[points.length - 1]
                                            const firstPoint = points[0]
                                            areaD = `${lineD} L ${lastPoint.x} ${height - paddingY} L ${firstPoint.x} ${height - paddingY} Z`
                                        }

                                        // Y Axis Labels - use nice rounded numbers (reversed so max at top, 0 at bottom)
                                        const yLabels = [Math.round(max), Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0]
                                        const xLabelInterval = graphRange === '30d' ? 3 : 1

                                        return (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                                                    {/* Y-Axis - aligned with graph padding */}
                                                    <div style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        justifyContent: 'space-between',
                                                        paddingTop: paddingY,
                                                        paddingBottom: paddingY,
                                                        paddingRight: 10,
                                                        height: '100%',
                                                        color: '#666',
                                                        fontSize: '0.75rem',
                                                        width: 50,
                                                        textAlign: 'right',
                                                        boxSizing: 'border-box'
                                                    }}>
                                                        {yLabels.map((v, i) => <div key={i}>{v}</div>)}
                                                    </div>

                                                    <div style={{ flex: 1, position: 'relative' }}>
                                                        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                                            <defs>
                                                                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="0%" stopColor="#FFE4C4" stopOpacity="0.4" />
                                                                    <stop offset="100%" stopColor="#FFE4C4" stopOpacity="0" />
                                                                </linearGradient>
                                                            </defs>

                                                            {/* Horizontal Grid lines */}
                                                            {yLabels.map((_, i) => (
                                                                <line
                                                                    key={i}
                                                                    x1={paddingX}
                                                                    y1={height - paddingY - (i / 4) * (height - 2 * paddingY)}
                                                                    x2={width - paddingX}
                                                                    y2={height - paddingY - (i / 4) * (height - 2 * paddingY)}
                                                                    stroke="#1a1a1a"
                                                                    strokeWidth="1.5"
                                                                />
                                                            ))}

                                                            {/* Vertical Grid lines */}
                                                            {data.length > 1 && data.map((_, i) => {
                                                                const showLine = graphRange === '30d' ? i % xLabelInterval === 0 || i === data.length - 1 : true
                                                                if (!showLine) return null
                                                                const x = paddingX + (i / (data.length - 1)) * (width - 2 * paddingX)
                                                                return (
                                                                    <line
                                                                        key={`x-${i}`}
                                                                        x1={x}
                                                                        y1={paddingY}
                                                                        x2={x}
                                                                        y2={height - paddingY}
                                                                        stroke="#151515"
                                                                        strokeWidth="1"
                                                                        opacity={i === 0 || i === data.length - 1 ? 0.25 : 0.14}
                                                                        strokeDasharray={graphRange === '30d' ? '2 6' : 'none'}
                                                                    />
                                                                )
                                                            })}

                                                            {/* Area & Line Animated */}
                                                            <motion.path
                                                                d={areaD}
                                                                fill="url(#chartGradient)"
                                                                stroke="none"
                                                                initial={false}
                                                                animate={{ d: areaD }}
                                                                transition={{ duration: 0.4, ease: "easeInOut" }}
                                                            />
                                                            <motion.path
                                                                d={lineD}
                                                                fill="none"
                                                                stroke="#FFE4C4"
                                                                strokeWidth="3"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                initial={false}
                                                                animate={{ d: lineD }}
                                                                transition={{ duration: 0.4, ease: "easeInOut" }}
                                                            />

                                                            {/* Smooth cursor-following interaction */}
                                                            {(() => {
                                                                // Calculate hovered position and interpolated value
                                                                if (hoverX !== null && data.length > 0) {
                                                                    // Map hoverX (0-1) to data index (continuous)
                                                                    const continuousIndex = hoverX * (data.length - 1)
                                                                    const indexFloor = Math.floor(continuousIndex)
                                                                    const indexCeil = Math.min(data.length - 1, Math.ceil(continuousIndex))
                                                                    const t = continuousIndex - indexFloor

                                                                    // Interpolate value between adjacent data points
                                                                    const v1 = rawValues[indexFloor] || 0
                                                                    const v2 = rawValues[indexCeil] || 0
                                                                    const interpolatedValue = v1 * (1 - t) + v2 * t

                                                                    // Get display value (nearest data point)
                                                                    const nearestIndex = Math.round(continuousIndex)
                                                                    const nearestData = data[nearestIndex]

                                                                    // Calculate pixel positions
                                                                    const cursorX = paddingX + hoverX * (width - 2 * paddingX)
                                                                    const cursorY = height - paddingY - (interpolatedValue / max) * (height - 2 * paddingY)

                                                                    return (
                                                                        <>
                                                                            {/* Vertical guide line */}
                                                                            <motion.line
                                                                                x1={cursorX}
                                                                                y1={paddingY}
                                                                                x2={cursorX}
                                                                                y2={height - paddingY}
                                                                                stroke="rgba(255,228,196,0.2)"
                                                                                strokeWidth="1"
                                                                                strokeDasharray="4 4"
                                                                                initial={false}
                                                                                animate={{ x1: cursorX, x2: cursorX }}
                                                                                transition={{ duration: 0.05 }}
                                                                            />
                                                                            {/* Cursor-following point */}
                                                                            <motion.circle
                                                                                r={7}
                                                                                fill="#FFE4C4"
                                                                                stroke="#0a0a0a"
                                                                                strokeWidth="3"
                                                                                initial={false}
                                                                                animate={{ cx: cursorX, cy: cursorY }}
                                                                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                                                            />
                                                                        </>
                                                                    )
                                                                }
                                                                return null
                                                            })()}

                                                            {/* Invisible interaction layer - covers entire SVG */}
                                                            <rect
                                                                x={0}
                                                                y={0}
                                                                width={width}
                                                                height={height}
                                                                fill="transparent"
                                                                style={{ cursor: 'crosshair' }}
                                                                onMouseMove={(e) => {
                                                                    const svg = e.currentTarget.ownerSVGElement
                                                                    if (!svg) return
                                                                    const svgRect = svg.getBoundingClientRect()
                                                                    // Calculate position relative to SVG viewBox coordinates
                                                                    const mouseX = ((e.clientX - svgRect.left) / svgRect.width) * width
                                                                    // Convert to 0-1 range within the graph area (accounting for padding)
                                                                    const graphX = (mouseX - paddingX) / (width - 2 * paddingX)
                                                                    // Store pixel position relative to container for tooltip
                                                                    const pixelX = e.clientX - svgRect.left
                                                                    const pixelY = e.clientY - svgRect.top
                                                                    // Clamp to valid range
                                                                    if (graphX >= 0 && graphX <= 1) {
                                                                        setHoverX(graphX)
                                                                        setMousePos({ x: pixelX, y: pixelY })
                                                                    } else {
                                                                        setHoverX(null)
                                                                        setMousePos(null)
                                                                    }
                                                                }}
                                                                onMouseLeave={() => { setHoverX(null); setMousePos(null) }}
                                                            />
                                                        </svg>

                                                        {/* Floating Tooltip */}
                                                        {hoverX !== null && mousePos && data.length > 0 && (() => {
                                                            // Calculate nearest data point for tooltip
                                                            const continuousIndex = hoverX * (data.length - 1)
                                                            const nearestIndex = Math.round(continuousIndex)
                                                            const nearestData = data[nearestIndex]

                                                            if (!nearestData) return null

                                                            return (
                                                                <motion.div
                                                                    initial={false}
                                                                    animate={{
                                                                        x: mousePos.x,
                                                                        y: mousePos.y - 60,
                                                                    }}
                                                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        left: 0,
                                                                        top: 0,
                                                                        transform: 'translate(-50%, -100%)',
                                                                        background: 'rgba(20,20,20,0.95)',
                                                                        border: '1px solid #333',
                                                                        borderRadius: 10,
                                                                        padding: '10px 14px',
                                                                        minWidth: 80,
                                                                        zIndex: 10,
                                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                                                        pointerEvents: 'none',
                                                                        backdropFilter: 'blur(8px)'
                                                                    }}>
                                                                    <div style={{ color: '#FFE4C4', fontSize: '1rem', fontWeight: 700, marginBottom: 2, textAlign: 'center' }}>
                                                                        {nearestData.value}
                                                                    </div>
                                                                    <div style={{ color: '#888', fontSize: '0.75rem', textAlign: 'center' }}>
                                                                        {nearestData.label}
                                                                    </div>
                                                                </motion.div>
                                                            )
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* X-Axis Labels - Show All */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: paddingX, paddingRight: paddingX, marginTop: 12, color: '#666', fontSize: '0.75rem' }}>
                                                    {data.map((d, i) => {
                                                        const showLabel = graphRange === '30d' ? i % xLabelInterval === 0 || i === data.length - 1 : true
                                                        return (
                                                            <div key={i} style={{ width: `${100 / data.length}%`, textAlign: 'center', opacity: showLabel ? 0.85 : 0.2 }}>
                                                                {showLabel ? d.label : ''}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== API KEYS SECTION ========== */}
                    {activeSection === 'preferences' && (
                        <div style={{ padding: '40px', paddingBottom: 100 }}>
                            <div className="page-header">
                                <h2 className="page-title">API Keys</h2>
                                <div className="page-subtitle">Configure your API credentials for each provider</div>
                            </div>

                            {/* API Keys Section */}
                            <div className="settings-section-card">
                                <h3 className="section-head">Provider Credentials</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {/* OpenRouter */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>OpenRouter API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showOpenRouterKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.openRouterApiKey}
                                                onChange={e => handleChange({ openRouterApiKey: e.target.value })}
                                                placeholder="sk-or-..."
                                            />
                                            <button onClick={() => setShowOpenRouterKey(!showOpenRouterKey)} style={{ padding: '0 12px', background: '#222', border: '1px solid #333', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showOpenRouterKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Perplexity */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Perplexity API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showPerplexityKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.perplexityApiKey}
                                                onChange={e => handleChange({ perplexityApiKey: e.target.value })}
                                                placeholder="pplx-..."
                                            />
                                            <button onClick={() => setShowPerplexityKey(!showPerplexityKey)} style={{ padding: '0 12px', background: '#222', border: '1px solid #333', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showPerplexityKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Gemini */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Gemini API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showGeminiKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.geminiApiKey}
                                                onChange={e => handleChange({ geminiApiKey: e.target.value })}
                                                placeholder="AIza..."
                                            />
                                            <button onClick={() => setShowGeminiKey(!showGeminiKey)} style={{ padding: '0 12px', background: '#222', border: '1px solid #333', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Groq */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Groq API Key</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                type={showGroqKey ? 'text' : 'password'}
                                                className="setting-input-scira"
                                                value={pendingSettings.groqApiKey}
                                                onChange={e => handleChange({ groqApiKey: e.target.value })}
                                                placeholder="gsk_..."
                                            />
                                            <button onClick={() => setShowGroqKey(!showGroqKey)} style={{ padding: '0 12px', background: '#222', border: '1px solid #333', color: '#888', borderRadius: 8, cursor: 'pointer' }}>
                                                {showGroqKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Ollama */}
                                    <div>
                                        <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Ollama URL</label>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <input
                                                className="setting-input-scira"
                                                value={pendingSettings.ollamaUrl}
                                                onChange={e => handleChange({ ollamaUrl: e.target.value })}
                                                placeholder="http://localhost:11434"
                                            />
                                            <button onClick={checkOllama} style={{ padding: '0 16px', background: isOllamaConnected ? '#1a3a1a' : '#222', border: `1px solid ${isOllamaConnected ? '#22c55e' : '#333'}`, color: isOllamaConnected ? '#22c55e' : '#fff', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                {isCheckingOllama ? '...' : (isOllamaConnected ? '✓ Connected' : 'Check')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* System Prompt */}
                            <div className="settings-section-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h3 className="section-head" style={{ margin: 0 }}>System Prompt</h3>
                                    <button onClick={resetSystemPrompt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#888', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        <RotateCcw size={12} /> Reset
                                    </button>
                                </div>
                                <textarea
                                    className="setting-input-scira"
                                    value={pendingSettings.systemPrompt}
                                    onChange={e => handleChange({ systemPrompt: e.target.value })}
                                    style={{ minHeight: 200, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.7 }}
                                    placeholder="Enter the system prompt for the AI..."
                                />
                            </div>

                            {/* Title Generation Model */}
                            <div className="settings-section-card">
                                <h3 className="section-head">Title Generation</h3>
                                <div style={{ marginBottom: 12 }}>
                                    <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>Model for generating chat titles</label>
                                    <select
                                        className="setting-input-scira"
                                        value={pendingSettings.titleModel}
                                        onChange={e => handleChange({ titleModel: e.target.value })}
                                        style={{ padding: '12px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
                                    >
                                        <optgroup label="Gemini">
                                            {(pendingSettings.geminiModels || []).map((m: any) => (
                                                <option key={m.code} value={m.code}>{m.displayName}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Groq">
                                            {(pendingSettings.groqModels || []).map((m: any) => (
                                                <option key={m.code} value={m.code}>{m.displayName}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="OpenRouter">
                                            {(pendingSettings.configuredModels || []).map((m: any) => (
                                                <option key={m.code} value={m.code}>{m.displayName}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Perplexity">
                                            {(pendingSettings.perplexityModels || []).map((m: any) => (
                                                <option key={m.code} value={m.code}>{m.displayName}</option>
                                            ))}
                                        </optgroup>
                                        {(pendingSettings.ollamaModels || []).length > 0 && (
                                            <optgroup label="Ollama">
                                                {(pendingSettings.ollamaModels || []).map((m: any) => (
                                                    <option key={m.code} value={m.code}>{m.displayName}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                    <div style={{ color: '#666', fontSize: '0.8rem', marginTop: 8 }}>
                                        Recommended: Fast models like Gemini 2.0 Flash or Groq Llama 3.1 8B
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== CONNECTORS SECTION ========== */}
                    {activeSection === 'connectors' && (
                        <div style={{ padding: '40px' }}>
                            <div className="page-header">
                                <h2 className="page-title">Connectors</h2>
                                <div className="page-subtitle">Manage external service connections</div>
                            </div>

                            <div className="settings-section-card">
                                <h3 className="section-head">Ollama (Local Models)</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: '#151515', borderRadius: 8 }}>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 500 }}>Status</div>
                                            <div style={{ color: '#666', fontSize: '0.85rem' }}>{pendingSettings.ollamaUrl}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontSize: '0.8rem', padding: '4px 12px', borderRadius: 20, background: isOllamaConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: isOllamaConnected ? '#22c55e' : '#ef4444' }}>
                                                {isOllamaConnected ? 'Connected' : 'Disconnected'}
                                            </span>
                                            <button onClick={checkOllama} style={{ padding: '6px 12px', background: '#222', border: '1px solid #333', color: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                                                <RefreshCw size={14} className={isCheckingOllama ? 'spin' : ''} />
                                            </button>
                                        </div>
                                    </div>

                                    {isOllamaConnected && pendingSettings.ollamaModels.length > 0 && (
                                        <div style={{ padding: 16, background: '#151515', borderRadius: 8 }}>
                                            <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: 12 }}>Available Models</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                {pendingSettings.ollamaModels.map((m: any) => (
                                                    <span key={m.code} style={{ padding: '4px 12px', background: '#222', borderRadius: 6, fontSize: '0.8rem', color: '#ccc' }}>
                                                        {m.displayName}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== MEMORIES SECTION ========== */}
                    {activeSection === 'memories' && (
                        <div style={{ padding: '40px' }}>
                            <div className="page-header">
                                <h2 className="page-title">Memories</h2>
                                <div className="page-subtitle">Manage persistent context and memories</div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, flexDirection: 'column', color: '#444' }}>
                                <Brain size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                                <div>Coming Soon</div>
                                <div style={{ fontSize: '0.85rem', color: '#555', marginTop: 8 }}>Persistent memory feature is under development</div>
                            </div>
                        </div>
                    )}

                    {/* ========== MODELS SECTION ========== */}
                    {activeSection === 'models' && (
                        <div style={{ padding: '40px' }}>
                            <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: 18,
                                    background: 'linear-gradient(135deg, rgba(0,188,212,0.1), rgba(168,85,247,0.1))',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                                }}>
                                    <Cpu size={32} color="#fff" />
                                </div>
                                <div>
                                    <h2 className="page-title" style={{ margin: 0, fontSize: '2rem', background: 'linear-gradient(to right, #fff, #aaa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Models</h2>
                                    <div className="page-subtitle" style={{ fontSize: '1rem', marginTop: 4 }}>Configure your AI model catalog</div>
                                </div>
                            </div>

                            {/* OpenRouter Models */}
                            <div className="settings-section-card" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 0, overflow: 'hidden' }}>
                                <div style={{
                                    padding: '20px 24px',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    background: 'linear-gradient(to right, rgba(0,188,212,0.05), transparent)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <img src="/provider-logos/openrouter.png" alt="OpenRouter" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain' }} />
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e0e0e0' }}>OpenRouter</h3>
                                            <div style={{ fontSize: '0.8rem', color: '#666' }}>Cloud models via OpenRouter API</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '6px 12px', background: 'rgba(0,188,212,0.1)', borderRadius: 20, color: '#00bcd4', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {(pendingSettings.configuredModels || []).length} Models
                                    </div>
                                </div>

                                <div style={{ padding: 24 }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                                        {(pendingSettings.configuredModels || []).map((model: any, index: number) => (
                                            <div key={index} style={{
                                                padding: 16,
                                                background: 'rgba(255,255,255,0.03)',
                                                borderRadius: 12,
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                transition: 'all 0.2s',
                                                flex: '1 1 300px',
                                                maxWidth: '600px'
                                            }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                                                }}
                                            >
                                                {editingIndex === index ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <input value={editCode} onChange={e => setEditCode(e.target.value)} className="setting-input-scira" style={{ padding: '8px 10px', fontSize: '0.85rem' }} placeholder="Code" />
                                                            <input value={editName} onChange={e => setEditName(e.target.value)} className="setting-input-scira" style={{ padding: '8px 10px', fontSize: '0.85rem' }} placeholder="Name" />
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <button onClick={saveEdit} style={{ flex: 1, padding: '6px', background: '#1a3a1a', border: '1px solid #22c55e', color: '#22c55e', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                                                            <button onClick={() => setEditingIndex(null)} style={{ flex: 1, padding: '6px', background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                            <div style={{
                                                                width: 36, height: 36, borderRadius: 8,
                                                                background: 'rgba(0,188,212,0.1)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: '#00bcd4'
                                                            }}>
                                                                {model.displayName.toLowerCase().includes('claude') ? <Box size={18} /> :
                                                                    model.displayName.toLowerCase().includes('gpt') ? <Cpu size={18} /> :
                                                                        model.displayName.toLowerCase().includes('gemini') ? <Sparkles size={18} /> :
                                                                            <Zap size={18} />}
                                                            </div>
                                                            <div>
                                                                <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500 }}>{model.displayName}</div>
                                                                <div style={{ color: '#888', fontSize: '0.75rem', marginTop: 2 }}>{model.code}</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            <button onClick={() => startEdit(index)} style={{ padding: 8, background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', borderRadius: 4, transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#ccc' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666' }}><Edit2 size={16} /></button>
                                                            <button onClick={() => deleteModel(index)} style={{ padding: 8, background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', borderRadius: 4, transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666' }}><Trash2 size={16} /></button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}

                                        {/* Add New Card */}
                                    </div>
                                </div>
                                {/* Add New Card */}
                                <div style={{
                                    padding: '20px 24px',
                                    borderTop: '1px solid rgba(255,255,255,0.06)',
                                    background: 'rgba(0,0,0,0.2)',
                                    display: 'flex', flexDirection: 'column', gap: 16
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.9 }}>
                                        <div style={{ padding: 6, borderRadius: '50%', background: 'rgba(0,188,212,0.1)', color: '#00bcd4' }}><Plus size={14} /></div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#e0e0e0' }}>Add Custom Model</div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                                        <input
                                            value={newModelCode}
                                            onChange={e => setNewModelCode(e.target.value)}
                                            className="setting-input-scira"
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px',
                                                fontSize: '0.9rem',
                                                background: 'rgba(0,0,0,0.3)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: 10,
                                                color: '#fff'
                                            }}
                                            placeholder="Model ID (e.g. anthropic/claude-3)"
                                        />
                                        <input
                                            value={newModelName}
                                            onChange={e => setNewModelName(e.target.value)}
                                            className="setting-input-scira"
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px',
                                                fontSize: '0.9rem',
                                                background: 'rgba(0,0,0,0.3)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: 10,
                                                color: '#fff'
                                            }}
                                            placeholder="Display Name (e.g. Claude 3)"
                                        />
                                    </div>

                                    <button
                                        onClick={addModel}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            background: 'linear-gradient(90deg, #00bcd4, #0097a7)',
                                            border: 'none',
                                            borderRadius: 10,
                                            color: '#fff',
                                            cursor: 'pointer',
                                            fontSize: '0.95rem',
                                            fontWeight: 600,
                                            opacity: (!newModelCode || !newModelName) ? 0.5 : 1,
                                            pointerEvents: (!newModelCode || !newModelName) ? 'none' : 'auto',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 4px 12px rgba(0,188,212,0.2)'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                    >
                                        Add Model to Library
                                    </button>
                                </div>
                            </div>

                            {/* Perplexity Models */}
                            {(pendingSettings.perplexityModels || []).length > 0 && (
                                <div className="settings-section-card" style={{ marginTop: 24, background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 0, overflow: 'hidden' }}>
                                    <div style={{
                                        padding: '20px 24px',
                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        background: 'linear-gradient(to right, rgba(168,85,247,0.05), transparent)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <img src="/provider-logos/perplexity.png" alt="Perplexity" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain' }} />
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e0e0e0' }}>Perplexity</h3>
                                                <div style={{ fontSize: '0.8rem', color: '#666' }}>Online search models</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '6px 12px', background: 'rgba(168,85,247,0.1)', borderRadius: 20, color: '#a855f7', fontSize: '0.85rem', fontWeight: 500 }}>
                                            {(pendingSettings.perplexityModels || []).length} Models
                                        </div>
                                    </div>
                                    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                        {(pendingSettings.perplexityModels || []).map((model: any, index: number) => (
                                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7' }} />
                                                <div>
                                                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500 }}>{model.displayName}</div>
                                                    <div style={{ color: '#888', fontSize: '0.75rem' }}>{model.code}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Gemini Models */}
                            {(pendingSettings.geminiModels || []).length > 0 && (
                                <div className="settings-section-card" style={{ marginTop: 24, background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 0, overflow: 'hidden' }}>
                                    <div style={{
                                        padding: '20px 24px',
                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        background: 'linear-gradient(to right, rgba(77,171,247,0.05), transparent)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <img src="/provider-logos/gemini.png" alt="Gemini" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain' }} />
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e0e0e0' }}>Gemini</h3>
                                                <div style={{ fontSize: '0.8rem', color: '#666' }}>Google's generative models</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '6px 12px', background: 'rgba(77,171,247,0.1)', borderRadius: 20, color: '#4dabf7', fontSize: '0.85rem', fontWeight: 500 }}>
                                            {(pendingSettings.geminiModels || []).length} Models
                                        </div>
                                    </div>
                                    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                        {(pendingSettings.geminiModels || []).map((model: any, index: number) => (
                                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4dabf7' }} />
                                                <div>
                                                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500 }}>{model.displayName}</div>
                                                    <div style={{ color: '#888', fontSize: '0.75rem' }}>{model.code}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Groq Models */}
                            {(pendingSettings.groqModels || []).length > 0 && (
                                <div className="settings-section-card" style={{ marginTop: 24, background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 0, overflow: 'hidden' }}>
                                    <div style={{
                                        padding: '20px 24px',
                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        background: 'linear-gradient(to right, rgba(252,196,25,0.05), transparent)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <img src="/provider-logos/groq.png" alt="Groq" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain' }} />
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e0e0e0' }}>Groq</h3>
                                                <div style={{ fontSize: '0.8rem', color: '#666' }}>Ultra-fast LPU inference</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '6px 12px', background: 'rgba(252,196,25,0.1)', borderRadius: 20, color: '#fcc419', fontSize: '0.85rem', fontWeight: 500 }}>
                                            {(pendingSettings.groqModels || []).length} Models
                                        </div>
                                    </div>
                                    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                        {(pendingSettings.groqModels || []).map((model: any, index: number) => (
                                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fcc419' }} />
                                                <div>
                                                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500 }}>{model.displayName}</div>
                                                    <div style={{ color: '#888', fontSize: '0.75rem' }}>{model.code}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Ollama Models */}
                            {(pendingSettings.ollamaModels || []).length > 0 && (
                                <div className="settings-section-card" style={{ marginTop: 24, background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 0, overflow: 'hidden' }}>
                                    <div style={{
                                        padding: '20px 24px',
                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        background: 'linear-gradient(to right, rgba(34,197,94,0.05), transparent)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <img src="/provider-logos/ollama.png" alt="Ollama" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'contain' }} />
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e0e0e0' }}>Ollama</h3>
                                                <div style={{ fontSize: '0.8rem', color: '#666' }}>Local offline models</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '6px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: 20, color: '#22c55e', fontSize: '0.85rem', fontWeight: 500 }}>
                                            {(pendingSettings.ollamaModels || []).length} Models
                                        </div>
                                    </div>
                                    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                        {(pendingSettings.ollamaModels || []).map((model: any, index: number) => (
                                            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                                                <div>
                                                    <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500 }}>{model.displayName}</div>
                                                    <div style={{ color: '#888', fontSize: '0.75rem' }}>{model.code}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ========== TODOS SECTION ========== */}
                    {activeSection === 'todos' && (
                        <div style={{ padding: '40px', paddingBottom: 100 }}>
                            <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: 18,
                                    background: 'linear-gradient(135deg, rgba(255,200,120,0.15), rgba(255,150,80,0.1))',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                                }}>
                                    <ListTodo size={32} color="#FFE4C4" />
                                </div>
                                <div>
                                    <h2 className="page-title" style={{ margin: 0, fontSize: '2rem', background: 'linear-gradient(to right, #FFE4C4, #ff9966)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Todo List</h2>
                                    <div className="page-subtitle" style={{ fontSize: '1rem', marginTop: 4 }}>Keep track of your tasks</div>
                                </div>
                            </div>

                            {/* Add Todo Input */}
                            <div className="settings-section-card" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, marginBottom: 24 }}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <input
                                        type="text"
                                        className="setting-input-scira"
                                        placeholder="Add a new todo..."
                                        value={newModelCode}
                                        onChange={e => setNewModelCode(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newModelCode.trim()) {
                                                const newTodo: TodoItem = {
                                                    id: Date.now().toString(),
                                                    text: newModelCode.trim(),
                                                    completed: false,
                                                    createdAt: Date.now()
                                                }
                                                handleChange({ todos: [...(pendingSettings.todos || []), newTodo] })
                                                setNewModelCode('')
                                            }
                                        }}
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        onClick={() => {
                                            if (newModelCode.trim()) {
                                                const newTodo: TodoItem = {
                                                    id: Date.now().toString(),
                                                    text: newModelCode.trim(),
                                                    completed: false,
                                                    createdAt: Date.now()
                                                }
                                                handleChange({ todos: [...(pendingSettings.todos || []), newTodo] })
                                                setNewModelCode('')
                                            }
                                        }}
                                        style={{
                                            padding: '12px 20px',
                                            background: 'linear-gradient(135deg, #FFE4C4, #ff9966)',
                                            border: 'none',
                                            borderRadius: 10,
                                            color: '#000',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8
                                        }}
                                    >
                                        <Plus size={18} />
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Todo List */}
                            <div className="settings-section-card" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                                {(!pendingSettings.todos || pendingSettings.todos.length === 0) ? (
                                    <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
                                        <ListTodo size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                                        <div style={{ fontSize: '1.1rem', marginBottom: 8 }}>No todos yet</div>
                                        <div style={{ fontSize: '0.9rem' }}>Add your first todo above!</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {pendingSettings.todos.map((todo: TodoItem, index: number) => (
                                            <motion.div
                                                key={todo.id}
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 16,
                                                    padding: '16px 20px',
                                                    borderBottom: index < pendingSettings.todos.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                                    background: todo.completed ? 'rgba(255,255,255,0.02)' : 'transparent'
                                                }}
                                            >
                                                <button
                                                    onClick={() => {
                                                        const updated = pendingSettings.todos.map((t: TodoItem) =>
                                                            t.id === todo.id ? { ...t, completed: !t.completed } : t
                                                        )
                                                        handleChange({ todos: updated })
                                                    }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                                >
                                                    {todo.completed ? (
                                                        <CheckSquare size={22} color="#FFE4C4" />
                                                    ) : (
                                                        <Square size={22} color="#666" />
                                                    )}
                                                </button>
                                                <span style={{
                                                    flex: 1,
                                                    fontSize: '1rem',
                                                    color: todo.completed ? '#666' : '#e0e0e0',
                                                    textDecoration: todo.completed ? 'line-through' : 'none',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    {todo.text}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        const updated = pendingSettings.todos.filter((t: TodoItem) => t.id !== todo.id)
                                                        handleChange({ todos: updated })
                                                    }}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: 8,
                                                        borderRadius: 8,
                                                        color: '#666',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.color = '#ff6b6b'}
                                                    onMouseLeave={e => e.currentTarget.style.color = '#666'}
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Stats */}
                            {pendingSettings.todos && pendingSettings.todos.length > 0 && (
                                <div style={{ marginTop: 16, display: 'flex', gap: 16, justifyContent: 'center' }}>
                                    <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 20, fontSize: '0.85rem', color: '#888' }}>
                                        {pendingSettings.todos.filter((t: TodoItem) => !t.completed).length} remaining
                                    </div>
                                    <div style={{ padding: '8px 16px', background: 'rgba(255,228,196,0.1)', borderRadius: 20, fontSize: '0.85rem', color: '#FFE4C4' }}>
                                        {pendingSettings.todos.filter((t: TodoItem) => t.completed).length} completed
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* Unsaved Changes Bar */}
            {hasChanges && (
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '12px 24px',
                    background: showWarning ? 'rgba(239, 68, 68, 0.95)' : 'rgba(30, 34, 42, 0.98)',
                    backdropFilter: 'blur(12px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 24,
                    borderRadius: 12,
                    border: showWarning ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: showWarning ? '0 8px 32px rgba(239, 68, 68, 0.3)' : '0 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 100,
                    animation: showWarning ? 'shake 0.5s ease' : 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s'
                }}>
                    <span style={{ color: showWarning ? '#fff' : '#a0a0a0', fontSize: '0.9rem', fontWeight: showWarning ? 600 : 400 }}>
                        {showWarning ? 'Save or discard changes first!' : 'Careful — you have unsaved changes!'}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={cancelChanges}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                padding: '6px 12px',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={e => e.currentTarget.style.color = showWarning ? 'rgba(255,255,255,0.8)' : '#6b7280'}
                        >
                            Discard
                        </button>
                        <button
                            onClick={saveChanges}
                            style={{
                                background: showWarning ? '#fff' : '#22c55e',
                                border: 'none',
                                color: showWarning ? '#dc2626' : '#fff',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                padding: '8px 16px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = showWarning ? '#f0f0f0' : '#16a34a'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = showWarning ? '#fff' : '#22c55e'
                            }}
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(-50%) translateX(0); }
                    20%, 60% { transform: translateX(-50%) translateX(-8px); }
                    40%, 80% { transform: translateX(-50%) translateX(8px); }
                }
            `}</style>
        </div>
    )
}
