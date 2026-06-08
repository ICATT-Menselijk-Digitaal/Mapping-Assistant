import { ref } from 'vue'
import type { MappingSetImported } from '@/domain/events/MappingSetImported'
import type { MappingSetExport } from '@/utils/exportSerializer'
import { deserializeMappingSet } from '@/utils/importDeserializer'
import { useMappings } from './useMappings'
import { useAISuggestions } from './useAISuggestions'
import type { useSourceSchema } from './useSourceSchema'
import type { useTargetSchema } from './useTargetSchema'

export type SourceSchemaHandle = ReturnType<typeof useSourceSchema>
export type TargetSchemaHandle = ReturnType<typeof useTargetSchema>

export function useImport() {
  const lastEvent = ref<MappingSetImported | null>(null)

  async function importMappingSet(
    file: File,
    source: SourceSchemaHandle,
    target: TargetSchemaHandle,
  ): Promise<MappingSetExport> {
    const text = await file.text()
    const parsed: unknown = JSON.parse(text)
    const payload = deserializeMappingSet(parsed)

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

  return { importMappingSet, lastEvent }
}
