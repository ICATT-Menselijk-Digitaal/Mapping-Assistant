import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SchemaField } from '@/types'
import type { TransformationSuggestion, TransformationSuggestionRequested } from '@/types/ai'
import { isTypeCompatible } from '@/utils/typeCompatibility'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const CLAUDE_MODEL = 'anthropic/claude-sonnet-4-6'

function buildPrompt(source: SchemaField, target: SchemaField): string {
  return `You are a JSONata transformation assistant. Given source and target field metadata, return a JSON object.

Source field: name="${source.name}", path="${source.path}", dataType="${source.dataType}"${source.description ? `, description="${source.description}"` : ''}
Target field: name="${target.name}", path="${target.path}", dataType="${target.dataType}"${target.description ? `, description="${target.description}"` : ''}

Return ONLY a JSON object (no markdown) with:
- expression: string — a JSONata expression that transforms the source value to match the target type/format
- explanation: string — plain English explanation
- example: { input: string, output: string } — a concrete example

If no safe transformation can be determined, return:
- warning: string — why no safe transformation could be found
- explanation: string — what the administrator should do instead`
}

function parseAIContent(raw: string, mappingId: string): TransformationSuggestion | null {
  let text = raw.trim()
  // Strip markdown fences if present
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n')
    const lastFence = text.lastIndexOf('```')
    if (firstNewline !== -1 && lastFence > firstNewline) {
      text = text.slice(firstNewline + 1, lastFence).trim()
    }
  }
  // Extract JSON object
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null

  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>

  if (typeof parsed.warning === 'string') {
    return {
      mappingId,
      warning: parsed.warning,
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
    }
  }

  if (typeof parsed.expression === 'string') {
    return {
      mappingId,
      expression: parsed.expression,
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
      example:
        parsed.example &&
        typeof (parsed.example as Record<string, unknown>).input === 'string' &&
        typeof (parsed.example as Record<string, unknown>).output === 'string'
          ? { input: (parsed.example as Record<string, string>).input, output: (parsed.example as Record<string, string>).output }
          : undefined,
    }
  }

  return null
}

export const useTransformationSuggestions = defineStore('transformationSuggestions', () => {
  const pendingRequests = ref<TransformationSuggestionRequested[]>([])
  const generatedSuggestions = ref<Record<string, TransformationSuggestion>>({})
  const loadingMappingIds = ref<Set<string>>(new Set())

  function handleMappingCreated(mappingId: string, sourceField: SchemaField, targetField: SchemaField): void {
    if (isTypeCompatible(sourceField, targetField)) return
    const request: TransformationSuggestionRequested = { mappingId, sourceField, targetField }
    pendingRequests.value.push(request)
    console.debug('[TransformationSuggestions] TransformationSuggestionRequested', {
      mappingId,
      sourceType: sourceField.dataType,
      targetType: targetField.dataType,
    })
  }

  async function generateSuggestion(request: TransformationSuggestionRequested): Promise<void> {
    const { mappingId, sourceField, targetField } = request
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (!apiKey) {
      console.warn('[TransformationSuggestions] OpenRouter API key not configured')
      return
    }

    loadingMappingIds.value = new Set(loadingMappingIds.value).add(mappingId)

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 512,
          messages: [{ role: 'user', content: buildPrompt(sourceField, targetField) }],
        }),
      })

      if (!response.ok) throw new Error(`API returned ${response.status}`)

      const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
      const raw = data.choices[0]?.message?.content ?? ''
      const suggestion = parseAIContent(raw, mappingId)

      if (suggestion) {
        generatedSuggestions.value = { ...generatedSuggestions.value, [mappingId]: suggestion }
        console.debug('[TransformationSuggestions] TransformationSuggestionGenerated', {
          mappingId,
          expression: suggestion.expression?.slice(0, 50),
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

  return { pendingRequests, generatedSuggestions, loadingMappingIds, handleMappingCreated, generateSuggestion }
})
