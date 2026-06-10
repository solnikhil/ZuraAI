export type ResearchState =
  | 'search'
  | 'synthesize'
  | 'recover-leaked-tool-call'
  | 'deterministic-answer'

export interface SearchEvidenceItem {
  query: string
  title: string
  url: string
  source: string
  snippet: string
  date?: string
  score?: number
}
