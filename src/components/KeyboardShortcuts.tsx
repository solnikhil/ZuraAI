import React from 'react'
import { Keyboard } from 'lucide-react'
import './KeyboardShortcuts.css'

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
                { keys: ['Ctrl', ','], description: 'Open Settings (when main window focused)' },
            ]
        }
    ]

    return (
        <div className="keyboard-shortcuts-panel">
            <div className="shortcuts-header">
                <Keyboard size={20} />
                <h2>Keyboard Shortcuts</h2>
            </div>

            <div className="shortcuts-content">
                {shortcuts.map((category, idx) => (
                    <div key={idx} className="shortcuts-category">
                        <h3>{category.category}</h3>
                        <div className="shortcuts-list">
                            {category.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="shortcut-row">
                                    <div className="shortcut-keys">
                                        {item.keys.map((key, keyIdx) => (
                                            <React.Fragment key={keyIdx}>
                                                <kbd>{key}</kbd>
                                                {keyIdx < item.keys.length - 1 && <span className="plus">+</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <span className="shortcut-description">{item.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="shortcuts-footer">
                <p>Tip: You can change some shortcuts in Settings → Preferences</p>
            </div>
        </div>
    )
}

