import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SchemaField } from '@/types'
import type { TransformationSuggestion, TransformationSuggestionRequested } from '@/types/ai'
import type { TransformationType } from '@/types/mapping'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const CLAUDE_MODEL = 'anthropic/claude-sonnet-4-6'

function describeMismatch(ruleType: TransformationType, source: SchemaField, target: SchemaField): string {
  switch (ruleType) {
    case 'truncate':
      if (source.maxLength === undefined) {
        return `length constraint: source has no max length, target is limited to ${target.maxLength} characters`
      }
      return `length constraint: source max length (${source.maxLength}) exceeds target max length (${target.maxLength})`
    case 'default':
      return 'required mismatch: source is optional, target is required'
    case 'cast':
      return `type mismatch: source is ${source.dataType}, target is ${target.dataType}`
    case 'date-format':
      return 'date format conversion: both fields are of type date, but the format may differ between systems'
    default:
      return `transformation needed: ${source.dataType} to ${target.dataType}`
  }
}

function buildPrompt(source: SchemaField, target: SchemaField, ruleType: TransformationType): string {
  const mismatch = describeMismatch(ruleType, source, target)

  return `You are a JSONata transformation assistant. Given source and target field metadata and a mismatch, return a JSON array. All string values must be written in Dutch.

Source field: name="${source.name}", path="${source.path}", dataType="${source.dataType}", required=${source.required}${source.maxLength !== undefined ? `, maxLength=${source.maxLength}` : ''}${source.description ? `, description="${source.description}"` : ''}
Target field: name="${target.name}", path="${target.path}", dataType="${target.dataType}", required=${target.required}${target.maxLength !== undefined ? `, maxLength=${target.maxLength}` : ''}${target.description ? `, description="${target.description}"` : ''}

Detected mismatch:
1. ${mismatch}

Return ONLY a JSON array (no markdown). Include one object for the detected mismatch, then append any additional suggestions you think are valuable based on the field names, types, or descriptions.

For length constraint mismatches, common practice is to truncate the value and append "..." to signal the text was cut. You may suggest an alternative if it better fits the field semantics.

For each item where a safe transformation CAN be determined:
- mismatch: string — copy the label from the detected mismatch, or a short label describing your own suggestion
- expression: string — a JSONata expression that addresses this specific transformation
- explanation: string — uitleg in het Nederlands
- example: { input: string, output: string } — a concrete example (keep both values under 60 characters)

For each item where NO safe transformation can be determined:
- mismatch: string — copy the label from the detected mismatch, or a short label
- warning: string — waarom er geen veilige transformatie gevonden kon worden
- explanation: string — wat de beheerder in plaats daarvan moet doen`
}

function parseItem(item: Record<string, unknown>, mappingId: string): TransformationSuggestion | null {
  const mismatch = typeof item.mismatch === 'string' ? item.mismatch : ''

  if (typeof item.warning === 'string') {
    return {
      mappingId,
      mismatch,
      warning: item.warning,
      explanation: typeof item.explanation === 'string' ? item.explanation : '',
    }
  }

  if (typeof item.expression === 'string') {
    return {
      mappingId,
      mismatch,
      expression: item.expression,
      explanation: typeof item.explanation === 'string' ? item.explanation : '',
      example: (() => {
        if (!item.example) return undefined
        const ex = item.example as Record<string, unknown>
        if (typeof ex.input !== 'string' || typeof ex.output !== 'string') return undefined
        return { input: ex.input, output: ex.output }
      })(),
    }
  }

  return null
}

function parseAIContent(raw: string, mappingId: string): TransformationSuggestion[] {
  let text = raw.trim()
  // Strip markdown fences if present
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n')
    const lastFence = text.lastIndexOf('```')
    if (firstNewline !== -1 && lastFence > firstNewline) {
      text = text.slice(firstNewline + 1, lastFence).trim()
    }
  }

  // Try parsing as array first
  const arrayStart = text.indexOf('[')
  const arrayEnd = text.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayStart < arrayEnd) {
    try {
      const parsed = JSON.parse(text.slice(arrayStart, arrayEnd + 1)) as unknown[]
      if (Array.isArray(parsed)) {
        const results = parsed
          .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          .map((item) => parseItem(item, mappingId))
          .filter((s): s is TransformationSuggestion => s !== null)
        if (results.length > 0) return results
      }
    } catch {
      // fall through to object parsing
    }
  }

  // Backward compat: try parsing as single object and wrap in array
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (objectStart === -1 || objectEnd === -1) return []

  try {
    const parsed = JSON.parse(text.slice(objectStart, objectEnd + 1)) as Record<string, unknown>
    const item = parseItem(parsed, mappingId)
    return item ? [item] : []
  } catch {
    return []
  }
}

export const useTransformationSuggestions = defineStore('transformationSuggestions', () => {
  const generatedSuggestions = ref<Record<string, TransformationSuggestion[]>>({})
  const loadingMappingIds = ref<Set<string>>(new Set())

  async function generateSuggestion(request: TransformationSuggestionRequested): Promise<void> {
    const { mappingId, sourceField, targetField } = request
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (!apiKey) {
      console.warn('[TransformationSuggestions] OpenRouter API key not configured')
      return
    }

    loadingMappingIds.value = new Set(loadingMappingIds.value).add(mappingId)

    const prompt = buildPrompt(sourceField, targetField, request.ruleType)
    console.log('[AI Suggestie] Prompt naar AI:\n' + prompt)

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!response.ok) throw new Error(`API returned ${response.status}`)

      const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
      const raw = data.choices[0]?.message?.content ?? ''
      const suggestions = parseAIContent(raw, mappingId)

      if (suggestions.length > 0) {
        generatedSuggestions.value = { ...generatedSuggestions.value, [mappingId]: suggestions }
        console.debug('[TransformationSuggestions] TransformationSuggestionGenerated', {
          mappingId,
          count: suggestions.length,
        })
      } else {
        console.warn('[TransformationSuggestions] Could not parse AI response', raw)
      }
    } catch (e) {
      console.warn('[TransformationSuggestions] AI service unreachable or response unparseable', e)
    } finally {
      const next = new Set(loadingMappingIds.value)
      next.delete(mappingId)
      loadingMappingIds.value = next
    }
  }

  function clearSuggestion(mappingId: string): void {
    const next = { ...generatedSuggestions.value }
    delete next[mappingId]
    generatedSuggestions.value = next
  }

  return { generatedSuggestions, loadingMappingIds, generateSuggestion, clearSuggestion }
})
