import { ref } from 'vue'
import type { MappingSetImported } from '@/domain/events/MappingSetImported'
import type { MappingSetExport } from '@/utils/exportSerializer'
import { deserializeMappingSet, ImportFormatError } from '@/utils/importDeserializer'
import { useMappings } from './useMappings'
import { useAISuggestions } from './useAISuggestions'
import type { useSourceSchema } from './useSourceSchema'
import type { useTargetSchema } from './useTargetSchema'

export type SourceSchemaHandle = ReturnType<typeof useSourceSchema>
export type TargetSchemaHandle = ReturnType<typeof useTargetSchema>

export function useImport() {
  const lastEvent = ref<MappingSetImported | null>(null)
  const error = ref<string | null>(null)
  const warnings = ref<string[]>([])

  async function importMappingSet(
    file: File,
    source: SourceSchemaHandle,
    target: TargetSchemaHandle,
  ): Promise<MappingSetExport | null> {
    error.value = null
    warnings.value = []

    const text = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      error.value = 'Ongeldig importbestand: geen geldige JSON.'
      return null
    }

    let payload: MappingSetExport
    try {
      const result = deserializeMappingSet(parsed)
      payload = result.payload
      warnings.value = result.warnings
    } catch (e) {
      if (e instanceof ImportFormatError) {
        error.value = `Ongeldig importbestand: ${e.message}`
        return null
      }
      throw e
    }

    await source.restoreFromExport(payload.sourceSchema)
    await target.restoreFromExport(payload.targetSchema)

    const mappingsStore = useMappings()
    mappingsStore.restoreMappings(payload.fieldMappings, source.schema.value, target.schema.value)

    const aiStore = useAISuggestions()
    aiStore.restoreStatistics(payload.statistics.ai)

    lastEvent.value = {
      type: 'MappingSetImported',
      payload,
      timestamp: new Date().toISOString(),
    }

    return payload
  }

  return { importMappingSet, lastEvent, error, warnings }
}
