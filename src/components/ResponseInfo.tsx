import { Info, Zap, Clock } from './icons'

interface UsageData {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
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

    return (
        <div style={{
            backgroundColor: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
            borderRadius: '12px',
            padding: '16px',
            width: '260px',
            boxShadow: 'var(--theme-shadow-md)',
            color: 'var(--theme-text-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--theme-text-tertiary)', fontSize: '13px', fontWeight: 500 }}>
                <Info size={14} />
                Response Info
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Model</span>
                <span style={{
                    background: 'var(--theme-accent-muted)',
                    color: 'var(--theme-accent)',
                    padding: '3px 10px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    <Zap size={10} fill="currentColor" />
                    {displayModel}
                </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Generation Time</span>
                <span style={{ fontSize: '13px', color: 'var(--theme-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {formattedDuration}
                </span>
            </div>

            {(finishReason || typeof requestedMaxTokens === 'number') && (
                <>
                    <div style={{ height: '1px', background: 'var(--theme-border)' }} />
                    {typeof requestedMaxTokens === 'number' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Requested Max</span>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-secondary)' }}>{fmt(requestedMaxTokens)}</span>
                        </div>
                    )}
                    {finishReason && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Stop Reason</span>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-secondary)' }}>{finishReason}</span>
                        </div>
                    )}
                </>
            )}

            {usage && (
                <>
                    <div style={{ height: '1px', background: 'var(--theme-border)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--theme-text-muted)' }}>Token Usage</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <div style={{ background: 'var(--theme-surface-hover)', padding: '6px 10px', borderRadius: '6px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>Input</div>
                                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(inputTokens)}</div>
                            </div>
                            <div style={{ background: 'var(--theme-surface-hover)', padding: '6px 10px', borderRadius: '6px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>Output</div>
                                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(outputTokens)}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>Total Tokens</span>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalTokens)}</span>
                        </div>
                        {(usage.tps !== undefined || usage.ttft !== undefined) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <div style={{ background: 'var(--theme-surface-hover)', padding: '6px 10px', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>Speed</div>
                                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtTps(usage.tps)} t/s</div>
                                </div>
                                <div style={{ background: 'var(--theme-surface-hover)', padding: '6px 10px', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>First Token</div>
                                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(usage.ttft)}ms</div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
