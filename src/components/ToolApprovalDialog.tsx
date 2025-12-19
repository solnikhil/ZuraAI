// Tool Approval Dialog - Shows when a sensitive tool needs user confirmation
// **Feature: agent-mode, Property 7: Sensitive tools require approval based on settings**
// **Validates: Requirements 4.3**

import React from 'react'
import { ShieldCheck, AlertTriangle, X, Check } from 'lucide-react'
import { ToolCall } from '../tools/executor'
import { getToolByName } from '../tools/definitions'
import './ToolApprovalDialog.css'

export interface ToolApprovalDialogProps {
    toolCall: ToolCall
    onApprove: () => void
    onReject: () => void
    isVisible: boolean
}

export default function ToolApprovalDialog({
    toolCall,
    onApprove,
    onReject,
    isVisible
}: ToolApprovalDialogProps) {
    if (!isVisible) return null

    const toolDef = getToolByName(toolCall.name)
    const category = toolDef?.category || 'unknown'
    
    // Determine risk level based on category
    const isHighRisk = ['computer', 'system', 'file'].includes(category)
    
    // Format arguments for display
    const formatArgs = (args: Record<string, any>): string => {
        return Object.entries(args)
            .map(([key, value]) => {
                const displayValue = typeof value === 'string' 
                    ? (value.length > 50 ? value.substring(0, 50) + '...' : value)
                    : JSON.stringify(value)
                return `${key}: ${displayValue}`
            })
            .join('\n')
    }

    return (
        <div className="tool-approval-overlay">
            <div className="tool-approval-dialog">
                <div className="tool-approval-header">
                    {isHighRisk ? (
                        <AlertTriangle className="tool-approval-icon warning" size={24} />
                    ) : (
                        <ShieldCheck className="tool-approval-icon" size={24} />
                    )}
                    <h3>Tool Approval Required</h3>
                </div>
                
                <div className="tool-approval-content">
                    <p className="tool-approval-description">
                        The agent wants to execute the following tool:
                    </p>
                    
                    <div className="tool-approval-details">
                        <div className="tool-name">
                            <span className="label">Tool:</span>
                            <span className="value">{toolCall.name}</span>
                        </div>
                        
                        {toolDef && (
                            <div className="tool-description">
                                <span className="label">Description:</span>
                                <span className="value">{toolDef.description}</span>
                            </div>
                        )}
                        
                        {Object.keys(toolCall.arguments).length > 0 && (
                            <div className="tool-arguments">
                                <span className="label">Parameters:</span>
                                <pre className="value">{formatArgs(toolCall.arguments)}</pre>
                            </div>
                        )}
                        
                        <div className="tool-category">
                            <span className="label">Category:</span>
                            <span className={`value category-${category}`}>{category}</span>
                        </div>
                    </div>
                    
                    {isHighRisk && (
                        <div className="tool-approval-warning">
                            <AlertTriangle size={16} />
                            <span>This tool can modify your system. Please review carefully.</span>
                        </div>
                    )}
                </div>
                
                <div className="tool-approval-actions">
                    <button 
                        className="tool-approval-btn reject"
                        onClick={onReject}
                    >
                        <X size={16} />
                        Deny
                    </button>
                    <button 
                        className="tool-approval-btn approve"
                        onClick={onApprove}
                    >
                        <Check size={16} />
                        Approve
                    </button>
                </div>
            </div>
        </div>
    )
}
