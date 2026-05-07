import { Zap, Clock } from './icons'

interface UsageData {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cachedInputTokens?: number
    cachedOutputTokens?: number
    tps?: number
    ttft?: number
    // Provider-specific field names (OpenAI/Groq format)
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    // Ollama format
    prompt_eval_count?: number
    eval_count?: number
}

interface ResponseInfoProps {
    model: string
    latency?: number
    usage?: UsageData
    finishReason?: string
    requestedMaxTokens?: number
}

export default function ResponseInfo({ model, latency, usage, finishReason, requestedMaxTokens }: ResponseInfoProps) {
    const formattedDuration = latency ? `${(latency / 1000).toFixed(1)}s` : '-'
    const fmt = (n?: number) => n?.toLocaleString() || '0'
    const fmtTps = (n?: number) => n ? n.toFixed(1) : '-'
    const displayModel = model.split('/').pop() || model

    const inputTokens = usage?.inputTokens ?? usage?.prompt_tokens ?? usage?.prompt_eval_count ?? 0
    const outputTokens = usage?.outputTokens ?? usage?.completion_tokens ?? usage?.eval_count ?? 0
    const totalTokens = usage?.totalTokens ?? usage?.total_tokens ?? 0
    const cachedInputTokens = usage?.cachedInputTokens ?? 0
    const cachedOutputTokens = usage?.cachedOutputTokens ?? 0
    const shouldShowCachedTokens = cachedInputTokens > 0 || cachedOutputTokens > 0

    const tokenMax = Math.max(inputTokens, outputTokens, 1)

    return (
        <div style={{
            backgroundColor: 'var(--theme-surface)',
            border: '1px solid color-mix(in srgb, var(--theme-border) 60%, transparent)',
            borderRadius: '14px',
            padding: '0',
            width: '280px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 1px 3px rgba(0,0,0,0.12)',
            color: 'var(--theme-text-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid color-mix(in srgb, var(--theme-border) 40%, transparent)',
                background: 'color-mix(in srgb, var(--theme-accent) 4%, var(--theme-surface))',
            }}>
                <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--theme-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                }}>Response Stats</span>
                <span style={{
                    background: 'var(--theme-accent-muted)',
                    color: 'var(--theme-accent)',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    maxWidth: '150px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    <Zap size={10} fill="currentColor" />
                    {displayModel}
                </span>
            </div>

            {/* Stats Grid */}
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Time + Stop Reason row */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{
                        flex: 1,
                        background: 'var(--theme-surface-hover)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Clock size={11} style={{ color: 'var(--theme-text-muted)', opacity: 0.7 }} />
                            <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>Latency</span>
                        </div>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--theme-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formattedDuration}
                        </span>
                    </div>

                    {finishReason && (
                        <div style={{
                            flex: 1,
                            background: 'var(--theme-surface-hover)',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                        }}>
                            <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>Stop</span>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                                {finishReason}
                            </span>
                        </div>
                    )}
                </div>

                {typeof requestedMaxTokens === 'number' && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0 2px',
                    }}>
                        <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>Max Tokens</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--theme-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(requestedMaxTokens)}
                        </span>
                    </div>
                )}
            </div>

            {/* Token Usage Section */}
            {usage && (
                <div style={{
                    borderTop: '1px solid color-mix(in srgb, var(--theme-border) 40%, transparent)',
                    padding: '12px 16px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--theme-surface-hover)',
                        borderRadius: '10px',
                        padding: '8px 12px',
                    }}>
                        <span style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: 'var(--theme-text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>Tokens</span>
                        <span style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--theme-text-primary)',
                            fontVariantNumeric: 'tabular-nums',
                        }}>{fmt(totalTokens)}</span>
                    </div>

                    {/* Token bars */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Input tokens */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '10.5px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>Input</span>
                                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--theme-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(inputTokens)}
                                </span>
                            </div>
                            <div style={{
                                height: '4px',
                                borderRadius: '2px',
                                background: 'color-mix(in srgb, var(--theme-border) 30%, transparent)',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%',
                                    borderRadius: '2px',
                                    width: `${Math.max((inputTokens / tokenMax) * 100, 2)}%`,
                                    background: 'var(--theme-accent)',
                                    opacity: 0.6,
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>
                        </div>

                        {/* Output tokens */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '10.5px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>Output</span>
                                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--theme-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(outputTokens)}
                                </span>
                            </div>
                            <div style={{
                                height: '4px',
                                borderRadius: '2px',
                                background: 'color-mix(in srgb, var(--theme-border) 30%, transparent)',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%',
                                    borderRadius: '2px',
                                    width: `${Math.max((outputTokens / tokenMax) * 100, 2)}%`,
                                    background: 'var(--theme-accent)',
                                    opacity: 0.85,
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>
                        </div>

                        {shouldShowCachedTokens && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', padding: '2px 0 0' }}>
                                <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>
                                    Cached input
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(cachedInputTokens)}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)', fontWeight: 500 }}>
                                    Cached output
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(cachedOutputTokens)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Speed / TTFT row */}
                    {(usage.tps !== undefined || usage.ttft !== undefined) && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                            {usage.tps !== undefined && (
                                <div style={{
                                    flex: 1,
                                    background: 'var(--theme-surface-hover)',
                                    borderRadius: '8px',
                                    padding: '8px 10px',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)', marginBottom: '2px' }}>Speed</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--theme-accent)', fontVariantNumeric: 'tabular-nums' }}>
                                        {fmtTps(usage.tps)} <span style={{ fontSize: '10px', fontWeight: 500, opacity: 0.7 }}>t/s</span>
                                    </div>
                                </div>
                            )}
                            {usage.ttft !== undefined && (
                                <div style={{
                                    flex: 1,
                                    background: 'var(--theme-surface-hover)',
                                    borderRadius: '8px',
                                    padding: '8px 10px',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: '10px', color: 'var(--theme-text-muted)', marginBottom: '2px' }}>First Token</div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--theme-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                        {fmt(usage.ttft)}<span style={{ fontSize: '10px', fontWeight: 500, opacity: 0.6 }}>ms</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
