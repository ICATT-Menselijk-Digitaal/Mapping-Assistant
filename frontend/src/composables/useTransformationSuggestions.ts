import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import jsonata from 'jsonata'
import { useApiKey } from '@/composables/useApiKey'
import type { SchemaField } from '@/types'
import type { MismatchType, TransformationRule } from '@/types/mapping'
import { useMappings } from '@/composables/useMappings'
import { analyze } from '@/domain/coupling'
import { callOpenRouter, extractJsonObject } from '@/utils/openRouter'

const MISMATCH_LABELS: Record<MismatchType, string> = {
  truncate: 'Maximale lengte overschreden',
  default: 'Bronveld is optioneel, doelveld is verplicht',
  cast: 'Type conversie vereist',
  'date-format': 'Datumformaat conversie',
}

function fieldDesc(f: SchemaField): string {
  const parts: string[] = [f.dataType]
  if (f.maxLength !== undefined) parts.push(`max ${f.maxLength}`)
  if (f.required) parts.push('vereist')
  const base = `${f.path} (${parts.join(', ')})`
  return f.description ? `${base} — ${f.description}` : base
}

function buildPrompt(
  sourceField: SchemaField,
  targetField: SchemaField,
  existingRules: TransformationRule[],
): string {
  const mismatches = analyze(sourceField, targetField).mismatches
  const mismatchLines =
    mismatches.length > 0
      ? mismatches.map((m) => `- ${MISMATCH_LABELS[m]}`).join('\n')
      : '- geen gedetecteerde problemen'
  const ruleLines =
    existingRules.length > 0 ? existingRules.map((r) => `- ${r.expression}`).join('\n') : '- geen'

  return `Je bent een JSONata-expert. Analyseer de twee velden hieronder en genereer één JSONata-expressie die:
1. Alle onderstaande gedetecteerde problemen oplost.
2. Eventuele extra problemen oplost die jij zelf signaleert op basis van de veldnamen, types en beschrijvingen.

Bronveld: ${fieldDesc(sourceField)}
Doelveld: ${fieldDesc(targetField)}

Gedetecteerde problemen:
${mismatchLines}

Bestaande regels (niet opnieuw voorstellen):
${ruleLines}

Geef je antwoord als ENKEL een geldig JSON-object. Geen markdown, geen uitleg buiten het object, geen tekst ervoor of erna:
{ "expression": "...", "label": "...", "explanation": "Leg in max 100 tekens uit waarom deze expressie gekozen is en wat hij doet." }`
}

interface ParsedSuggestion {
  expression: string
  label: string
  explanation: string
}

function parseSuggestion(raw: string): ParsedSuggestion | null {
  const obj = extractJsonObject<Record<string, unknown>>(raw)
  if (!obj || typeof obj.expression !== 'string') return null
  return {
    expression: obj.expression,
    label: typeof obj.label === 'string' ? obj.label : obj.expression,
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
  }
}

export const useTransformationSuggestions = defineStore('transformationSuggestions', () => {
  const loadingMappingIds = ref(new Set<string>())
  const isLoading = computed(() => loadingMappingIds.value.size > 0)
  const mappingsStore = useMappings()

  async function generateSuggestion(
    mappingId: string,
    sourceField: SchemaField,
    targetField: SchemaField,
    existingRules: TransformationRule[],
  ): Promise<void> {
    loadingMappingIds.value = new Set(loadingMappingIds.value).add(mappingId)

    const apiKey = await useApiKey().getKey()
    if (!apiKey) {
      const next = new Set(loadingMappingIds.value)
      next.delete(mappingId)
      loadingMappingIds.value = next
      return
    }

    const prompt = buildPrompt(sourceField, targetField, existingRules)
    console.log(`[AI Suggestie] Prompt:\n${prompt}`)

    try {
      const raw = await callOpenRouter({
        apiKey,
        maxTokens: 300,
        messages: [{ role: 'user', content: prompt }],
      })
      console.log(`[AI Suggestie] Response:\n${raw}`)

      const parsed = parseSuggestion(raw)
      if (!parsed) return

      try {
        jsonata(parsed.expression)
      } catch {
        return
      }

      mappingsStore.addTransformationRule(mappingId, {
        expression: parsed.expression,
        label: parsed.label,
        source: 'ai',
        aiExplanation: parsed.explanation || undefined,
      })
    } catch {
      // silently discard all errors
    } finally {
      const next = new Set(loadingMappingIds.value)
      next.delete(mappingId)
      loadingMappingIds.value = next
    }
  }

  return { isLoading, loadingMappingIds, generateSuggestion }
})
