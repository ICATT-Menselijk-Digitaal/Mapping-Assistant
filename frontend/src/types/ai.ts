import type { SchemaField } from '@/types/schema'

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected'

export interface AiSuggestion {
  id: string
  sourceFieldId: string
  targetFieldId: string
  confidenceScore: number // 0.0 – 1.0
  reasoning?: string
  status: SuggestionStatus
}

export interface TransformationSuggestion {
  mappingId: string
  expression: string
  label: string
  explanation: string
  example: { input: string; output: string }
}

// Re-exported for external consumers that pass field context to the AI composable
export type { SchemaField }
