// DateTime Tool - Get current date and time information

import type { ToolResult } from './types'

interface DatetimeArgs {
    timezone?: string
    format?: 'full' | 'date_only' | 'time_only'
}

export async function executeDatetime(args: DatetimeArgs): Promise<ToolResult> {
    try {
        const { timezone, format = 'full' } = args
        
        const now = new Date()
        
        // Format options
        const dateOptions: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            ...(timezone && { timeZone: timezone })
        }
        
        const timeOptions: Intl.DateTimeFormatOptions = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            ...(timezone && { timeZone: timezone })
        }
        
        const dateStr = now.toLocaleDateString('en-US', dateOptions)
        const timeStr = now.toLocaleTimeString('en-US', timeOptions)
        
        // Get timezone name
        const tzName = Intl.DateTimeFormat('en-US', { 
            timeZoneName: 'long',
            ...(timezone && { timeZone: timezone })
        }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value || 'Local Time'
        
        let formatted: string
        switch (format) {
            case 'date_only':
                formatted = dateStr
                break
            case 'time_only':
                formatted = `${timeStr} (${tzName})`
                break
            default:
                formatted = `${dateStr} at ${timeStr} (${tzName})`
        }
        
        return {
            success: true,
            data: {
                formatted,
                date: dateStr,
                time: timeStr,
                timezone: tzName,
                iso: now.toISOString(),
                unix: Math.floor(now.getTime() / 1000),
                dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
                month: now.toLocaleDateString('en-US', { month: 'long' }),
                year: now.getFullYear()
            }
        }
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to get date/time'
        }
    }
}

