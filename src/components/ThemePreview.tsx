import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Theme } from '../themes/themeDefinitions'
import { getThemeCssVariables } from '../themes/themeUtils'
import './ThemePreview.css'

interface ThemePreviewProps {
    theme: Theme
}

export default function ThemePreview({ theme }: ThemePreviewProps) {
    const previewStyle = getThemeCssVariables(theme) as React.CSSProperties

    return (
        <div className="theme-preview" data-theme={theme.id} style={previewStyle}>
            {/* Button Styles */}
            <section className="preview-section">
                <h4>Buttons</h4>
                <div className="preview-row">
                    <button className="preview-btn preview-btn-primary">Primary</button>
                    <button className="preview-btn preview-btn-secondary">Secondary</button>
                    <button className="preview-btn preview-btn-ghost">Ghost</button>
                </div>
            </section>

            {/* Input Styles */}
            <section className="preview-section">
                <h4>Inputs</h4>
                <div className="preview-row">
                    <input type="text" placeholder="Text input" className="preview-input" />
                    <input type="password" placeholder="Password" className="preview-input" />
                </div>
            </section>

            {/* Text Areas */}
            <section className="preview-section">
                <h4>Text Area</h4>
                <div className="preview-row">
                    <textarea placeholder="Multiline input" className="preview-textarea" rows={2} />
                </div>
            </section>

            {/* Select */}
            <section className="preview-section">
                <h4>Select</h4>
                <div className="preview-row">
                    <select className="preview-select">
                        <option>Option 1</option>
                        <option>Option 2</option>
                        <option>Option 3</option>
                    </select>
                </div>
            </section>

            {/* Card Styles */}
            <section className="preview-section">
                <h4>Cards</h4>
                <div className="preview-row">
                    <div className="preview-card">
                        <h5>Card Title</h5>
                        <p>Card content with some sample text</p>
                    </div>
                    <div className="preview-card preview-card-interactive">
                        <h5>Interactive Card</h5>
                        <p>Hover state preview</p>
                    </div>
                </div>
            </section>

            {/* Toggle/Switch */}
            <section className="preview-section">
                <h4>Toggles</h4>
                <div className="preview-row">
                    <label className="preview-toggle">
                        <input type="checkbox" defaultChecked />
                        <span className="preview-toggle-slider"></span>
                    </label>
                    <span className="preview-toggle-label">Enabled</span>
                    <label className="preview-toggle">
                        <input type="checkbox" />
                        <span className="preview-toggle-slider"></span>
                    </label>
                    <span className="preview-toggle-label">Disabled</span>
                </div>
            </section>

            {/* Chat Messages */}
            <section className="preview-section">
                <h4>Chat Messages</h4>
                <div className="preview-chat">
                    <div className="preview-message preview-message-user">
                        <p>User message example</p>
                    </div>
                    <div className="preview-message preview-message-assistant">
                        <p>Assistant message example with longer text to show wrapping behavior</p>
                    </div>
                </div>
            </section>

            {/* Tool Calls */}
            <section className="preview-section">
                <h4>Tool Calls</h4>
                <div className="preview-tool-call">
                    <div className="preview-tool-header">
                        <span className="preview-tool-name">web_search</span>
                        <span className="preview-tool-status">Running</span>
                    </div>
                    <div className="preview-tool-content">
                        Searching for information...
                    </div>
                </div>
            </section>

            {/* Settings Elements */}
            <section className="preview-section">
                <h4>Settings Elements</h4>
                <div className="preview-settings">
                    <div className="preview-setting-row">
                        <span>Setting Name</span>
                        <input type="range" className="preview-range" min="0" max="100" defaultValue="50" />
                    </div>
                    <div className="preview-setting-row">
                        <span>Another Setting</span>
                        <select className="preview-select preview-select-small">
                            <option>Option 1</option>
                            <option>Option 2</option>
                        </select>
                    </div>
                </div>
            </section>

            {/* Dropdown/Menu */}
            <section className="preview-section">
                <h4>Menus & Dropdowns</h4>
                <div className="preview-dropdown">
                    <button className="preview-dropdown-trigger">Dropdown</button>
                    <div className="preview-dropdown-menu">
                        <div className="preview-dropdown-item">Menu Item 1</div>
                        <div className="preview-dropdown-item">Menu Item 2</div>
                        <div className="preview-dropdown-item preview-dropdown-item-active">Active Item</div>
                    </div>
                </div>
            </section>

            {/* Navigation */}
            <section className="preview-section">
                <h4>Navigation</h4>
                <div className="preview-nav">
                    <div className="preview-nav-item preview-nav-item-active">Chat</div>
                    <div className="preview-nav-item">History</div>
                    <div className="preview-nav-item">Settings</div>
                </div>
            </section>

            {/* Badges/Tags */}
            <section className="preview-section">
                <h4>Badges & Tags</h4>
                <div className="preview-row">
                    <Badge>Default</Badge>
                    <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30">Success</Badge>
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-500 border-amber-500/30">Warning</Badge>
                    <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30">Error</Badge>
                </div>
            </section>

            {/* Progress */}
            <section className="preview-section">
                <h4>Progress</h4>
                <div className="preview-row preview-column">
                    <Progress value={60} className="h-2" />
                    <Progress value={35} className="h-2" indicatorClassName="animate-pulse" />
                </div>
            </section>

            {/* Toast/Notification */}
            <section className="preview-section">
                <h4>Notifications</h4>
                <div className="preview-row preview-column">
                    <div className="preview-toast preview-toast-success">
                        Success message here
                    </div>
                    <div className="preview-toast preview-toast-error">
                        Error message here
                    </div>
                    <div className="preview-toast preview-toast-warning">
                        Warning message here
                    </div>
                </div>
            </section>
        </div>
    )
}

