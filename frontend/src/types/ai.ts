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

export interface TransformationSuggestionRequested {
  mappingId: string
  sourceField: SchemaField
  targetField: SchemaField
}

export interface TransformationSuggestion {
  mappingId: string
  mismatch: string
  expression?: string
  explanation: string
  example?: { input: string; output: string }
  warning?: string
}

export interface TransformationSuggestionGenerated {
  mappingId: string
  suggestion: TransformationSuggestion
}
