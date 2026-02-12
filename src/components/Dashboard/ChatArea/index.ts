/**
 * ChatArea component barrel export
 * Provides the main chat interface with message display, input handling, and streaming
 */

// Main ChatArea component
export { default } from '../ChatArea'
export { default as ChatArea } from '../ChatArea'

// Sub-components
export { MessageRenderer } from './MessageRenderer'
export { FileUploadHandler, processFiles } from './FileUploadHandler'
export type { AttachedFile } from './FileUploadHandler'
export { InputArea } from './InputArea'

// Hooks
export { useStreamingChat } from './hooks'
export type { UseStreamingChatOptions, UseStreamingChatReturn } from './hooks'
