import React from 'react'
import { Info, Zap, Clock } from './icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface ResponseInfoProps {
    model: string
    latency?: number // in milliseconds
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        tps?: number // Tokens per second
        ttft?: number // Time to first token in ms
    }
    finishReason?: string
    requestedMaxTokens?: number
}

export default function ResponseInfo({ model, latency, usage, finishReason, requestedMaxTokens }: ResponseInfoProps) {
    // Format duration: 46.7s
    const formattedDuration = latency ? `${(latency / 1000).toFixed(1)}s` : '-'

    // Format numbers with commas
    const fmt = (n?: number) => n?.toLocaleString() || '0'
    const fmtTps = (n?: number) => n ? n.toFixed(1) : '-'

    // Clean model name (remove provider prefix if present)
    const displayModel = model.split('/').pop() || model

    // Handle legacy usage keys (snake_case)
    const inputTokens = usage?.inputTokens ?? (usage as any)?.prompt_tokens ?? (usage as any)?.prompt_eval_count ?? 0
    const outputTokens = usage?.outputTokens ?? (usage as any)?.completion_tokens ?? (usage as any)?.eval_count ?? 0
    const totalTokens = usage?.totalTokens ?? (usage as any)?.total_tokens ?? 0

    return (
        <Card className="bg-card/50 border-border backdrop-blur-sm">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Info size={16} />
                    Response Info
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Model */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Model</span>
                    <Badge variant="secondary" className="flex items-center gap-1">
                        <Zap size={12} fill="currentColor" />
                        {displayModel}
                    </Badge>
                </div>

                {/* Generation Time */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Generation Time</span>
                    <span className="text-sm flex items-center gap-1">
                        <Clock size={12} />
                        {formattedDuration}
                    </span>
                </div>

                {(finishReason || typeof requestedMaxTokens === 'number') && (
                    <>
                        <Separator />
                        {typeof requestedMaxTokens === 'number' && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Requested Max</span>
                                <span className="text-sm font-medium">{fmt(requestedMaxTokens)}</span>
                            </div>
                        )}
                        {finishReason && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Stop Reason</span>
                                <span className="text-sm font-medium">{finishReason}</span>
                            </div>
                        )}
                    </>
                )}

                {usage && (
                    <>
                        <Separator />

                        <div className="space-y-2">
                            <span className="text-xs font-medium text-muted-foreground">Token Usage</span>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-secondary/50 rounded-md p-2 text-center">
                                    <div className="text-xs text-muted-foreground">Input</div>
                                    <div className="text-sm font-medium">{fmt(inputTokens)}</div>
                                </div>
                                <div className="bg-secondary/50 rounded-md p-2 text-center">
                                    <div className="text-xs text-muted-foreground">Output</div>
                                    <div className="text-sm font-medium">{fmt(outputTokens)}</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-muted-foreground">Total Tokens</span>
                                <span className="text-sm font-medium">{fmt(totalTokens)}</span>
                            </div>

                            {(usage.tps !== undefined || usage.ttft !== undefined) && (
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    <div className="bg-secondary/50 rounded-md p-2 text-center">
                                        <div className="text-xs text-muted-foreground">Speed</div>
                                        <div className="text-sm font-medium">{fmtTps(usage.tps)} t/s</div>
                                    </div>
                                    <div className="bg-secondary/50 rounded-md p-2 text-center">
                                        <div className="text-xs text-muted-foreground">First Token</div>
                                        <div className="text-sm font-medium">{fmt(usage.ttft)}ms</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
