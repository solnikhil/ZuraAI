import { describe, expect, it } from 'vitest'
import {
  isLikelyBadGeneratedTitle,
  makeFirstMessageFallbackTitle,
  repairPersistedChatTitles,
} from './chatTitleRepair'
import type { ChatSession } from '../chat/types'

function makeSession(title: string, firstMessage = 'yo wsg gng'): ChatSession {
  return {
    id: crypto.randomUUID(),
    title,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: firstMessage,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('chatTitleRepair', () => {
  it('detects bad generated titles seen from title-generation failures', () => {
    expect(isLikelyBadGeneratedTitle('We are given: "hello". The user')).toBe(true)
    expect(isLikelyBadGeneratedTitle('We are asked: "You are a')).toBe(true)
    expect(isLikelyBadGeneratedTitle('We need to generate a short')).toBe(true)
    expect(isLikelyBadGeneratedTitle('Hello! How can I help you')).toBe(true)
  })

  it('keeps normal user-message fallback titles', () => {
    expect(isLikelyBadGeneratedTitle('yo wsg gng')).toBe(false)
    expect(isLikelyBadGeneratedTitle('Fix React hydration bug')).toBe(false)
  })

  it('repairs persisted bad titles from the first user message', () => {
    const { sessions, changed } = repairPersistedChatTitles([
      makeSession('We need to generate a short', 'yo wsg gng'),
      makeSession('Fix React hydration bug', 'Fix React hydration bug'),
    ])

    expect(changed).toBe(true)
    expect(sessions[0].title).toBe('yo wsg gng')
    expect(sessions[1].title).toBe('Fix React hydration bug')
  })

  it('truncates repaired titles the same way new chats do', () => {
    expect(
      makeFirstMessageFallbackTitle('Please help me debug a very annoying renderer issue')
    ).toBe('Please help me debug a very an...')
  })
})
