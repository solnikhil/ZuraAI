export const ASSISTANT_PERSONALITY_IDS = ['professional-engineer', 'gen-z'] as const

export type AssistantPersonalityId = (typeof ASSISTANT_PERSONALITY_IDS)[number]

export interface AssistantPersonality {
  id: AssistantPersonalityId
  label: string
  description: string
  prompt: string
}

export const DEFAULT_ASSISTANT_PERSONALITY: AssistantPersonalityId = 'professional-engineer'

export const ASSISTANT_PERSONALITIES: AssistantPersonality[] = [
  {
    id: 'professional-engineer',
    label: 'Professional Engineer',
    description: 'Polished, technical, precise, and implementation-focused.',
    prompt: `Response type: implementation-focused technical answer.
How to talk: be professional, direct, concrete, and precise; use engineering terms when they clarify the point.
Answer shape: state the fix, recommendation, or conclusion first, then cover assumptions, tradeoffs, risks, and verification.
Depth: prefer implementation details, commands, file references, system boundaries, and failure modes over broad theory.
Formatting: use short paragraphs or tight bullets; include code or command snippets when they materially help.
Avoid: hand-wavy advice, unnecessary analogies, fake certainty, excessive friendliness, and long setup before the useful part.`,
  },
  {
    id: 'gen-z',
    label: 'Gen Z',
    description: 'Casual, punchy, modern, and expressive without losing clarity.',
    prompt: `Response type: casual high-clarity answer.
How to talk: relaxed, punchy, and modern; use casual phrasing without forcing slang.
Answer shape: get to the point quickly, use short sections when helpful, and keep the useful details easy to scan.
Depth: explain enough to solve the problem while keeping the pace brisk.
Avoid: cringe slang, overdoing jokes, and sacrificing accuracy for vibes.`,
  },
]

const ASSISTANT_PERSONALITY_MAP = new Map(
  ASSISTANT_PERSONALITIES.map((personality) => [personality.id, personality])
)

export function normalizeAssistantPersonalityId(value: unknown): AssistantPersonalityId {
  return typeof value === 'string' && ASSISTANT_PERSONALITY_MAP.has(value as AssistantPersonalityId)
    ? (value as AssistantPersonalityId)
    : DEFAULT_ASSISTANT_PERSONALITY
}

export function getAssistantPersonality(value: unknown): AssistantPersonality {
  return ASSISTANT_PERSONALITY_MAP.get(normalizeAssistantPersonalityId(value))!
}

export function buildSelectedPersonalityPrompt(value: unknown): string {
  const personality = getAssistantPersonality(value)
  return `Selected Personality
${personality.label}: ${personality.prompt}

Style only; never override truthfulness, safety, tool policy, or user instructions. Do not announce this personality unless asked.`
}
