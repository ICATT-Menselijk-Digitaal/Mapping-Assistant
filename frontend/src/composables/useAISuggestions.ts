import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SchemaField, AiSuggestion } from '@/types'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { aiStatsResource } from '@/api/resources'
import type { ExportedAIStatistics } from '@/utils/exportSerializer'

export const CONFIDENCE_THRESHOLD = 0.7

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AIServiceError'
  }
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const CLAUDE_MODEL = 'anthropic/claude-sonnet-4-6'

interface ClaudeApiSuggestion {
  sourceField: string
  targetField: string
  confidenceScore: number
}

export const useAISuggestions = defineStore('aiSuggestions', () => {
  const suggestions = ref<AiSuggestion[]>([])
  const lowConfidenceSuggestions = ref<AiSuggestion[]>([])
  const isLoading = ref(false)
  const error = ref<AIServiceError | null>(null)

  // Accumulated AI statistics live in the shared aiStats resource (persisted +
  // workspace-scoped). Counters are writable projections (set seeds the resource,
  // as import/tests do); rejectedPairs is a read-only Set view.
  const accepted = computed({
    get: () => aiStatsResource.state.value.accepted,
    set: (value) => aiStatsResource.update((stats) => ({ ...stats, accepted: value })),
  })
  const rejected = computed({
    get: () => aiStatsResource.state.value.rejected,
    set: (value) => aiStatsResource.update((stats) => ({ ...stats, rejected: value })),
  })
  const totalGenerated = computed({
    get: () => aiStatsResource.state.value.totalGenerated,
    set: (value) => aiStatsResource.update((stats) => ({ ...stats, totalGenerated: value })),
  })
  const rejectedPairs = computed(() => new Set(aiStatsResource.state.value.rejectedPairs))

  async function generateSuggestions(
    sourceFields: SchemaField[],
    unmappedTargetFields: SchemaField[],
  ): Promise<AiSuggestion[]> {
    console.log('[AI] generateSuggestions called', {
      sourceCount: sourceFields.length,
      targetCount: unmappedTargetFields.length,
    })

    if (unmappedTargetFields.length === 0) {
      console.log('[AI] No unmapped target fields — skipping API call')
      return []
    }

    isLoading.value = true
    error.value = null

    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (!apiKey) throw new AIServiceError('OpenRouter API key not configured')

    // Capped to control prompt size and keep API costs low during PoC
    const sourceEntries = sourceFields
      .slice(0, 5)
      .map((f) => ({ path: f.path, description: f.description }))
    const targetEntries = unmappedTargetFields
      .slice(0, 5)
      .map((f) => ({ path: f.path, description: f.description }))

    const systemPrompt =
      'You are a field mapping assistant. Given source and target schema fields (each with a path and optional description), suggest the best one-to-one mappings. Return a JSON object with a "suggestions" array where each item has "sourceField" (path), "targetField" (path), and "confidenceScore" (number 0.0–1.0). Only return valid JSON, no markdown.'

    const userMessage = `Source fields: ${JSON.stringify(sourceEntries)}\n\nUnmapped target fields: ${JSON.stringify(targetEntries)}\n\nReturn JSON suggestions.`

    console.log('[AI] System prompt:\n' + systemPrompt)
    console.log('[AI] User message:\n' + userMessage)

    let responseData: unknown
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      })

      if (!response.ok) {
        throw new AIServiceError(`OpenRouter API returned ${response.status}`)
      }

      responseData = await response.json()
    } catch (e) {
      isLoading.value = false
      if (e instanceof AIServiceError) {
        error.value = e
        throw e
      }
      const err = new AIServiceError('AI service unreachable', e)
      error.value = err
      throw err
    }

    try {
      const raw =
        (responseData as { choices: Array<{ message: { content: string } }> }).choices[0]?.message
          ?.content ?? ''
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      const text = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw
      const parsed = JSON.parse(text) as { suggestions: ClaudeApiSuggestion[] }

      const rejectedSet = rejectedPairs.value
      const resolved: AiSuggestion[] = parsed.suggestions.reduce<AiSuggestion[]>((acc, s) => {
        const src = sourceFields.find((f) => f.path === s.sourceField || f.name === s.sourceField)
        const tgt = unmappedTargetFields.find(
          (f) => f.path === s.targetField || f.name === s.targetField,
        )
        if (!src || !tgt) return acc
        if (rejectedSet.has(`${src.id}::${tgt.id}`)) return acc
        acc.push({
          id: crypto.randomUUID() as string,
          sourceFieldId: src.id,
          targetFieldId: tgt.id,
          confidenceScore: Math.max(0, Math.min(1, s.confidenceScore)),
          status: 'pending',
        })
        return acc
      }, [])

      console.log(
        '[AI] Suggestions',
        resolved.map((s) => ({
          sourceFieldId: s.sourceFieldId,
          targetFieldId: s.targetFieldId,
          score: s.confidenceScore,
        })),
      )
      aiStatsResource.update((stats) => ({
        ...stats,
        totalGenerated: stats.totalGenerated + resolved.length,
      }))
      suggestions.value = resolved.filter((s) => s.confidenceScore >= CONFIDENCE_THRESHOLD)
      lowConfidenceSuggestions.value = resolved.filter(
        (s) => s.confidenceScore < CONFIDENCE_THRESHOLD,
      )

      return resolved
    } catch (e) {
      const err = new AIServiceError('Failed to parse AI response', e)
      error.value = err
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function acceptSuggestion(id: string, schemas?: { source: Schema; target: Schema }): void {
    const inHigh = suggestions.value.find((s) => s.id === id)
    const inLow = !inHigh && lowConfidenceSuggestions.value.find((s) => s.id === id)
    const suggestion = inHigh ?? inLow
    if (!suggestion) return

    const mappingsStore = useMappings()
    mappingsStore.createMapping({
      sourceFieldId: suggestion.sourceFieldId,
      targetFieldId: suggestion.targetFieldId,
      schemas,
    })

    if (inHigh) {
      suggestions.value = suggestions.value.filter((s) => s.id !== id)
    } else {
      lowConfidenceSuggestions.value = lowConfidenceSuggestions.value.filter((s) => s.id !== id)
    }
    aiStatsResource.update((stats) => ({ ...stats, accepted: stats.accepted + 1 }))
  }

  function rejectSuggestion(id: string): void {
    const inHigh = suggestions.value.find((s) => s.id === id)
    const inLow = !inHigh && lowConfidenceSuggestions.value.find((s) => s.id === id)
    const suggestion = inHigh ?? inLow
    if (!suggestion) return

    if (inHigh) {
      suggestions.value = suggestions.value.filter((s) => s.id !== id)
    } else {
      lowConfidenceSuggestions.value = lowConfidenceSuggestions.value.filter((s) => s.id !== id)
    }
    const pairKey = `${suggestion.sourceFieldId}::${suggestion.targetFieldId}`
    aiStatsResource.update((stats) => ({
      ...stats,
      rejected: stats.rejected + 1,
      rejectedPairs: stats.rejectedPairs.includes(pairKey)
        ? stats.rejectedPairs
        : [...stats.rejectedPairs, pairKey],
    }))
  }

  function restoreStatistics(stats: ExportedAIStatistics): void {
    suggestions.value = []
    lowConfidenceSuggestions.value = []
    aiStatsResource.write({
      totalGenerated: stats.totalGenerated,
      accepted: stats.accepted,
      rejected: stats.rejected,
      rejectedPairs: [...stats.rejectedPairs],
    })
  }

  return {
    suggestions,
    lowConfidenceSuggestions,
    isLoading,
    error,
    accepted,
    rejected,
    totalGenerated,
    rejectedPairs,
    generateSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    restoreStatistics,
  }
})
