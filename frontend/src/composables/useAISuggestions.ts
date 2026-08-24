import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SchemaField, AiSuggestion } from '@/types'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useApiKey } from '@/composables/useApiKey'
import { aiStatsResource } from '@/api/resources'
import type { ExportedAIStatistics } from '@/utils/exportSerializer'

export const CONFIDENCE_THRESHOLD = 0.7
export const MIN_CONFIDENCE_THRESHOLD = 0.3
export const MAX_SUGGESTIONS_PER_SOURCE = 2
export const MIN_REASONING_LENGTH = 5
// Reasoning is written in Dutch (it is shown to the administrator, see Task #112),
// so the filler blocklist matches Dutch phrasing rather than English.
export const GENERIC_FILLER_PHRASES: readonly string[] = [
  'dit lijkt een goede match',
  'goede match',
  'deze velden zijn vergelijkbaar',
  'logische koppeling',
  'waarschijnlijke match',
  'deze velden komen overeen',
]

function isValidReasoning(reasoning: unknown): reasoning is string {
  if (typeof reasoning !== 'string') return false
  const trimmed = reasoning.trim()
  if (trimmed.length < MIN_REASONING_LENGTH) return false
  const lower = trimmed.toLowerCase()
  return !GENERIC_FILLER_PHRASES.some((phrase) => lower.includes(phrase))
}

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AIServiceError'
  }
}

export class AIKeyRejectedError extends AIServiceError {
  constructor() {
    super('API key rejected by the AI provider')
    this.name = 'AIKeyRejectedError'
  }
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const CLAUDE_MODEL = 'anthropic/claude-sonnet-4-6'

interface ClaudeApiSuggestion {
  sourceField: string
  targetField: string
  confidenceScore: number
  reasoning: string
}

// Recover a suggestions array from a Claude response that may have been cut
// off mid-object because max_tokens was hit. Returns whatever complete
// `{ ... }` objects can be parsed before the truncation point.
function extractSuggestionsLenient(raw: string): ClaudeApiSuggestion[] | null {
  try {
    const parsed = JSON.parse(raw) as { suggestions?: ClaudeApiSuggestion[] }
    if (Array.isArray(parsed.suggestions)) return parsed.suggestions
  } catch {
    // fall through to lenient scan
  }

  const arrStart = raw.indexOf('"suggestions"')
  const bracket = arrStart === -1 ? -1 : raw.indexOf('[', arrStart)
  if (bracket === -1) return null

  const out: ClaudeApiSuggestion[] = []
  let depth = 0
  let objStart = -1
  let inString = false
  let escape = false
  for (let i = bracket + 1; i < raw.length; i++) {
    const c = raw[i]!
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(raw.slice(objStart, i + 1)) as ClaudeApiSuggestion)
        } catch {
          // skip malformed object
        }
        objStart = -1
      }
    } else if (c === ']' && depth === 0) {
      break
    }
  }
  return out
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

    const apiKey = await useApiKey().getKey()
    if (!apiKey) {
      isLoading.value = false
      return []
    }

    const sourceEntries = sourceFields.map((f) => ({ path: f.path, description: f.description }))
    const targetEntries = unmappedTargetFields.map((f) => ({
      path: f.path,
      description: f.description,
    }))

    const systemPrompt =
      'You are a field mapping assistant. Given source and target schema fields (each with a path and optional description), suggest the best one-to-one mappings. Return a JSON object with a "suggestions" array where each item has "sourceField" (path), "targetField" (path), "confidenceScore" (number 0.0-1.0), and "reasoning" (a single concise sentence, written in Dutch, explaining why these two specific fields were paired — this text is shown directly to the administrator). Only return valid JSON, no markdown.'

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
          max_tokens: 16000,
          messages: [
            {
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: systemPrompt,
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
            { role: 'user', content: userMessage },
          ],
        }),
      })

      if (response.status === 401 || response.status === 403) {
        throw new AIKeyRejectedError()
      }
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
      // Returns null when parsing failed outright; [] is a legitimate response
      // (AI explicitly reported no matches) and must not raise an error.
      const apiSuggestions = extractSuggestionsLenient(text)
      if (apiSuggestions === null) {
        throw new Error('No suggestions could be parsed from AI response')
      }

      const rejectedSet = rejectedPairs.value
      let droppedForReasoning = 0
      const resolved: AiSuggestion[] = apiSuggestions.reduce<AiSuggestion[]>((acc, s) => {
        const src = sourceFields.find((f) => f.path === s.sourceField || f.name === s.sourceField)
        const tgt = unmappedTargetFields.find(
          (f) => f.path === s.targetField || f.name === s.targetField,
        )
        if (!src || !tgt) return acc
        if (rejectedSet.has(`${src.id}::${tgt.id}`)) return acc
        if (!isValidReasoning(s.reasoning)) {
          droppedForReasoning++
          return acc
        }
        acc.push({
          id: crypto.randomUUID() as string,
          sourceFieldId: src.id,
          targetFieldId: tgt.id,
          confidenceScore: Math.max(0, Math.min(1, s.confidenceScore)),
          reasoning: s.reasoning.trim(),
          status: 'pending',
        })
        return acc
      }, [])

      console.log('[AI] Suggestions', {
        suggestions: resolved.map((s) => ({
          sourceFieldId: s.sourceFieldId,
          targetFieldId: s.targetFieldId,
          score: s.confidenceScore,
          reasoning: s.reasoning,
        })),
        droppedForReasoning,
      })
      aiStatsResource.update((stats) => ({
        ...stats,
        totalGenerated: stats.totalGenerated + resolved.length,
      }))

      const aboveMin = resolved.filter((s) => s.confidenceScore >= MIN_CONFIDENCE_THRESHOLD)

      const bySource = new Map<string, AiSuggestion[]>()
      for (const s of aboveMin) {
        const bucket = bySource.get(s.sourceFieldId) ?? []
        bucket.push(s)
        bySource.set(s.sourceFieldId, bucket)
      }
      const topSuggestions = [...bySource.values()].flatMap((arr) =>
        arr
          .sort((a, b) => b.confidenceScore - a.confidenceScore)
          .slice(0, MAX_SUGGESTIONS_PER_SOURCE),
      )

      suggestions.value = topSuggestions
        .filter((s) => s.confidenceScore >= CONFIDENCE_THRESHOLD)
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
      lowConfidenceSuggestions.value = topSuggestions
        .filter((s) => s.confidenceScore < CONFIDENCE_THRESHOLD)
        .sort((a, b) => b.confidenceScore - a.confidenceScore)

      return topSuggestions
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
