import { ChatSession } from '../contexts/ChatHistoryContext'

export function exportChatToMarkdown(session: ChatSession): string {
    let markdown = `# ${session.title}\n\n`
    markdown += `Created: ${new Date(session.createdAt).toLocaleString()}\n`
    markdown += `Updated: ${new Date(session.updatedAt).toLocaleString()}\n\n`
    markdown += `---\n\n`

    for (const message of session.messages) {
        const role = message.role === 'user' ? 'User' : 'Assistant'
        const timestamp = new Date(message.timestamp).toLocaleString()
        
        markdown += `## ${role} (${timestamp})\n\n`
        
        if (message.image) {
            markdown += `![Screenshot](data:image/png;base64,${message.image.split(',')[1]})\n\n`
        }
        
        markdown += `${message.content}\n\n`
        
        if (message.model) {
            markdown += `*Model: ${message.model}*\n`
        }
        if (message.usage) {
            markdown += `*Tokens: ${message.usage.inputTokens} input / ${message.usage.outputTokens} output (${message.usage.totalTokens} total)*\n`
        }
        if (message.latency) {
            markdown += `*Latency: ${(message.latency / 1000).toFixed(2)}s*\n`
        }
        
        markdown += `\n---\n\n`
    }

    return markdown
}

export function exportChatToText(session: ChatSession): string {
    let text = `${session.title}\n`
    text += `${'='.repeat(session.title.length)}\n\n`
    text += `Created: ${new Date(session.createdAt).toLocaleString()}\n`
    text += `Updated: ${new Date(session.updatedAt).toLocaleString()}\n\n`
    text += `${'-'.repeat(50)}\n\n`

    for (const message of session.messages) {
        const role = message.role === 'user' ? 'USER' : 'ASSISTANT'
        const timestamp = new Date(message.timestamp).toLocaleString()
        
        text += `[${role}] ${timestamp}\n`
        text += `${'-'.repeat(50)}\n`
        text += `${message.content}\n\n`
        
        if (message.model || message.usage || message.latency) {
            text += `Metadata: `
            const metadata: string[] = []
            if (message.model) metadata.push(`Model: ${message.model}`)
            if (message.usage) metadata.push(`Tokens: ${message.usage.totalTokens}`)
            if (message.latency) metadata.push(`Latency: ${(message.latency / 1000).toFixed(2)}s`)
            text += metadata.join(', ')
            text += `\n\n`
        }
        
        text += `${'-'.repeat(50)}\n\n`
    }

    return text
}

export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

