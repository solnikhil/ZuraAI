import React, { useState } from 'react'
import { X, Send, Bug, MessageSquare, Lightbulb } from './icons'
import { useToast } from './shared/Toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] bg-card border-border">
                <DialogHeader>
                    <DialogTitle>Send Feedback</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={feedbackType === 'bug' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFeedbackType('bug')}
                            className="flex-1"
                        >
                            <Bug size={16} className="mr-2" />
                            Bug Report
                        </Button>
                        <Button
                            type="button"
                            variant={feedbackType === 'feature' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFeedbackType('feature')}
                            className="flex-1"
                        >
                            <Lightbulb size={16} className="mr-2" />
                            Feature
                        </Button>
                        <Button
                            type="button"
                            variant={feedbackType === 'general' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFeedbackType('general')}
                            className="flex-1"
                        >
                            <MessageSquare size={16} className="mr-2" />
                            General
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="feedback-message">
                            {feedbackType === 'bug' ? 'Describe the bug' : feedbackType === 'feature' ? 'Describe your feature idea' : 'Your feedback'}
                        </Label>
                        <Textarea
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
                            className="bg-secondary border-border resize-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="feedback-email">Email (optional)</Label>
                        <Input
                            id="feedback-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            className="bg-secondary border-border"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !message.trim()}>
                            <Send size={16} className="mr-2" />
                            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

