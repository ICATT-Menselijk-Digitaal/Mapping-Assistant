import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { SchemaField, AiSuggestion } from '@/types'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useApiKey } from '@/composables/useApiKey'
import { aiStatsResource } from '@/api/resources'
import type { ExportedAIStatistics } from '@/utils/exportSerializer'
import { extractSuggestions } from '@/utils/suggestionResponseParser'
import { AIKeyRejectedError, AIServiceError, callOpenRouter } from '@/utils/openRouter'

// Re-exported so callers that historically imported these from this module
// keep working — the shared implementation now lives in @/utils/openRouter.
export { AIKeyRejectedError, AIServiceError }

export const CONFIDENCE_THRESHOLD_FOR_SPLIT = 0.7
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

export const useAISuggestions = defineStore('aiSuggestions', () => {
  const suggestions = ref<AiSuggestion[]>([])
  const lowConfidenceSuggestions = ref<AiSuggestion[]>([])
  const isLoading = ref(false)
  const error = ref<AIServiceError | null>(null)
  // At most one suggestion is traced on the canvas at a time. Kept next to
  // the suggestions arrays (not in useMappings) so accept/reject can clear
  // this locally without a cross-store hop. Mirrors the selectionNonce
  // pattern from useMappings: watchers that need to fire on re-trace (e.g.
  // scrolling to the same fields again) watch the nonce, not the id.
  const tracedSuggestionId = ref<string | null>(null)
  const selectionNonce = ref(0)

  function traceSuggestion(id: string | null): void {
    if (id === tracedSuggestionId.value) {
      tracedSuggestionId.value = null
    } else {
      tracedSuggestionId.value = id
    }
    selectionNonce.value++
  }

  // Keep suggestions consistent with actual mappings: if the administrator
  // manually maps a pair that a suggestion had proposed, drop that
  // suggestion (and clear its trace if any). Without this, the same pair
  // would show both a confirmed mapping line and a temporary trace line —
  // one visual for two things — and the card would stay actionable for an
  // accept that would silently no-op (createMapping dedupes exact pairs).
  const mappingsStore = useMappings()
  watch(
    () => mappingsStore.mappings,
    (list) => {
      if (list.length === 0) return
      const mapped = new Set(list.map((m) => `${m.sourceFieldId}::${m.targetFieldId}`))
      const isMapped = (s: AiSuggestion) => mapped.has(`${s.sourceFieldId}::${s.targetFieldId}`)

      const prunedHigh = suggestions.value.filter((s) => !isMapped(s))
      if (prunedHigh.length !== suggestions.value.length) suggestions.value = prunedHigh

      const prunedLow = lowConfidenceSuggestions.value.filter((s) => !isMapped(s))
      if (prunedLow.length !== lowConfidenceSuggestions.value.length) {
        lowConfidenceSuggestions.value = prunedLow
      }

      if (
        tracedSuggestionId.value &&
        !prunedHigh.some((s) => s.id === tracedSuggestionId.value) &&
        !prunedLow.some((s) => s.id === tracedSuggestionId.value)
      ) {
        tracedSuggestionId.value = null
      }
    },
    { deep: true, flush: 'sync' },
  )

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

    const toFieldEntry = (f: SchemaField) => ({
      path: f.path,
      description: f.description,
      dataType: f.dataType,
      required: f.required,
      maxLength: f.maxLength,
    })
    const sourceEntries = sourceFields.map(toFieldEntry)
    const targetEntries = unmappedTargetFields.map(toFieldEntry)

    const systemPrompt =
      'You are a field mapping assistant. Given source and target schema fields (each with a path, optional description, data type, required flag, and optional max length), suggest the best one-to-one mappings. Take each field\'s data type, required flag, and max length into account: when a candidate pair has a type or constraint mismatch (for example different data types, a stricter max length, or a required/optional difference), score it lower than an equivalent same-type match with no mismatch. Return a JSON object with a "suggestions" array where each item has "sourceField" (path), "targetField" (path), "confidenceScore" (number 0.0-1.0), and "reasoning" (concise Dutch text explaining why these two specific fields were paired, shown directly to the administrator. Structure: one short sentence stating the similarity, and, only when there is a type or constraint mismatch, a second sentence starting with "Let op:" naming the source field\'s type and constraint and the target field\'s type and constraint, for example "Let op: bronveld van type string zonder maximale lengte, doelveld is zelfde type maar heeft maximale lengte 80."). Only return valid JSON, no markdown.'

    const userMessage = `Source fields: ${JSON.stringify(sourceEntries)}\n\nUnmapped target fields: ${JSON.stringify(targetEntries)}\n\nReturn JSON suggestions.`

    console.log('[AI] System prompt:\n' + systemPrompt)
    console.log('[AI] User message:\n' + userMessage)

    let raw: string
    try {
      raw = await callOpenRouter({
        apiKey,
        maxTokens: 16000,
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          },
          { role: 'user', content: userMessage },
        ],
      })
    } catch (e) {
      isLoading.value = false
      const err = e instanceof AIServiceError ? e : new AIServiceError('AI service unreachable', e)
      error.value = err
      throw err
    }

    try {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      const text = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw
      // Returns null when parsing failed outright; [] is a legitimate response
      // (AI explicitly reported no matches) and must not raise an error.
      const apiSuggestions = extractSuggestions(text)
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
        .filter((s) => s.confidenceScore >= CONFIDENCE_THRESHOLD_FOR_SPLIT)
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
      lowConfidenceSuggestions.value = topSuggestions
        .filter((s) => s.confidenceScore < CONFIDENCE_THRESHOLD_FOR_SPLIT)
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
    if (tracedSuggestionId.value === id) tracedSuggestionId.value = null
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
    if (tracedSuggestionId.value === id) tracedSuggestionId.value = null
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
    tracedSuggestionId.value = null
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
    tracedSuggestionId,
    selectionNonce,
    accepted,
    rejected,
    totalGenerated,
    rejectedPairs,
    generateSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    traceSuggestion,
    restoreStatistics,
  }
})
