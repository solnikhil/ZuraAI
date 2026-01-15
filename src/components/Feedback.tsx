import React, { useState } from 'react'
import { X, Send, Bug, MessageSquare, Lightbulb } from './icons'
import { useToast } from './shared/Toast'
import './Feedback.css'

interface FeedbackProps {
    onClose: () => void
}

export default function Feedback({ onClose }: FeedbackProps) {
    const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'general'>('general')
    const [message, setMessage] = useState('')
    const [email, setEmail] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { showToast } = useToast()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!message.trim()) {
            showToast('Please enter your feedback', 'error')
            return
        }

        setIsSubmitting(true)

        try {
            // Get app version if available
            const version = window.updater ? await window.updater.getVersion() : 'unknown'
            
            // Open GitHub issue (user can submit manually)
            const githubIssueUrl = `https://github.com/YOUR_USERNAME/ZuraAI/issues/new?title=${encodeURIComponent(
                `${feedbackType === 'bug' ? '[Bug]' : feedbackType === 'feature' ? '[Feature Request]' : '[Feedback]'} ${message.substring(0, 50)}`
            )}&body=${encodeURIComponent(
                `**Type:** ${feedbackType}\n\n**Message:**\n${message}\n\n**Email:** ${email || 'Not provided'}\n\n**Version:** ${version}\n\n**Platform:** ${navigator.platform}`
            )}`
            
            window.open(githubIssueUrl, '_blank')
            
            showToast('Thank you for your feedback! Opening GitHub issue page...', 'success')
            setMessage('')
            setEmail('')
            setTimeout(() => onClose(), 1500)
        } catch (error) {
            console.error('Failed to submit feedback:', error)
            showToast('Failed to submit feedback. Please try again.', 'error')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="feedback-overlay" onClick={onClose}>
            <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
                <div className="feedback-header">
                    <h2>Send Feedback</h2>
                    <button className="feedback-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="feedback-form">
                    <div className="feedback-type-selector">
                        <button
                            type="button"
                            className={`feedback-type-btn ${feedbackType === 'bug' ? 'active' : ''}`}
                            onClick={() => setFeedbackType('bug')}
                        >
                            <Bug size={16} />
                            Bug Report
                        </button>
                        <button
                            type="button"
                            className={`feedback-type-btn ${feedbackType === 'feature' ? 'active' : ''}`}
                            onClick={() => setFeedbackType('feature')}
                        >
                            <Lightbulb size={16} />
                            Feature Request
                        </button>
                        <button
                            type="button"
                            className={`feedback-type-btn ${feedbackType === 'general' ? 'active' : ''}`}
                            onClick={() => setFeedbackType('general')}
                        >
                            <MessageSquare size={16} />
                            General Feedback
                        </button>
                    </div>

                    <div className="feedback-field">
                        <label htmlFor="feedback-message">
                            {feedbackType === 'bug' ? 'Describe the bug' : feedbackType === 'feature' ? 'Describe your feature idea' : 'Your feedback'}
                        </label>
                        <textarea
                            id="feedback-message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={
                                feedbackType === 'bug'
                                    ? 'What happened? What did you expect to happen?'
                                    : feedbackType === 'feature'
                                    ? 'What feature would you like to see?'
                                    : 'Share your thoughts...'
                            }
                            rows={6}
                            required
                        />
                    </div>

                    <div className="feedback-field">
                        <label htmlFor="feedback-email">Email (optional)</label>
                        <input
                            id="feedback-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                        />
                    </div>

                    <div className="feedback-actions">
                        <button type="button" onClick={onClose} className="feedback-cancel">
                            Cancel
                        </button>
                        <button type="submit" className="feedback-submit" disabled={isSubmitting || !message.trim()}>
                            <Send size={16} />
                            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

