import React from 'react'
import { Keyboard } from './icons'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export default function KeyboardShortcuts() {
    const shortcuts = [
        {
            category: 'General',
            items: [
                { keys: ['Ctrl', 'Shift', 'Z'], description: 'Toggle overlay window' },
                { keys: ['Ctrl', 'Shift', 'X'], description: 'Capture screenshot for analysis' },
                { keys: ['Esc'], description: 'Close overlay or cancel selection' },
            ]
        },
        {
            category: 'Chat',
            items: [
                { keys: ['Enter'], description: 'Send message' },
                { keys: ['Shift', 'Enter'], description: 'New line in message' },
                { keys: ['Ctrl', 'A'], description: 'Select all text in message (when focused)' },
            ]
        },
        {
            category: 'Navigation',
            items: [
                { keys: ['Ctrl', 'K'], description: 'Focus command bar' },
                { keys: ['Ctrl', ','], description: 'Open Settings (when main window focused)' },
            ]
        }
    ]

    return (
        <Card className="bg-card border-border">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Keyboard size={20} />
                    Keyboard Shortcuts
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                {shortcuts.map((category, idx) => (
                    <div key={idx} className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">{category.category}</h3>
                        <div className="space-y-2">
                            {category.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="flex items-center justify-between py-1">
                                    <div className="flex items-center gap-1">
                                        {item.keys.map((key, keyIdx) => (
                                            <React.Fragment key={keyIdx}>
                                                <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5">
                                                    {key}
                                                </Badge>
                                                {keyIdx < item.keys.length - 1 && (
                                                    <span className="text-muted-foreground text-xs">+</span>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <span className="text-sm text-muted-foreground">{item.description}</span>
                                </div>
                            ))}
                        </div>
                        {idx < shortcuts.length - 1 && <Separator className="mt-3" />}
                    </div>
                ))}
            </CardContent>

            <CardFooter className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                    Tip: You can change some shortcuts in Settings → Preferences
                </p>
            </CardFooter>
        </Card>
    )
}
