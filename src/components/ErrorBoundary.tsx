import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
    errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        }
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
            errorInfo: null
        }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error to debug endpoint
        try {
            fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: 'ErrorBoundary:componentDidCatch',
                    message: 'React error boundary caught error',
                    data: {
                        errorMessage: error.message,
                        errorStack: error.stack?.substring(0, 1000),
                        componentStack: errorInfo.componentStack?.substring(0, 1000)
                    },
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    runId: 'black-screen-fix',
                    hypothesisId: 'A'
                })
            }).catch(() => {})
        } catch {}

        this.setState({
            error,
            errorInfo
        })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#121212',
                    color: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px',
                    zIndex: 99999
                }}>
                    <h1 style={{ fontSize: '24px', marginBottom: '20px', color: '#f87171' }}>
                        Something went wrong
                    </h1>
                    <p style={{ color: '#aaa', marginBottom: '30px', textAlign: 'center', maxWidth: '600px' }}>
                        An error occurred while processing your request. The application will continue to work, but this action may have failed.
                    </p>
                    {this.state.error && (
                        <div style={{
                            background: 'rgba(255,255,255,0.05)',
                            padding: '20px',
                            borderRadius: '8px',
                            maxWidth: '800px',
                            width: '100%',
                            marginBottom: '20px'
                        }}>
                            <div style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '14px', wordBreak: 'break-word' }}>
                                {this.state.error.message}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null, errorInfo: null })
                            window.location.reload()
                        }}
                        style={{
                            background: '#FFCA28',
                            color: '#000',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Reload Application
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary

