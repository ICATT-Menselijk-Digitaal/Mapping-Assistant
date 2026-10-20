import { ref } from 'vue'
import { exportMetaResource } from '@/api/resources'
import type { Schema } from '@/domain/schema'
import type { MappingSetExported } from '@/domain/events/MappingSetExported'
import type { MappingSetExport } from '@/utils/exportSerializer'
import { serializeMappingSet } from '@/utils/exportSerializer'
import { useMappings } from './useMappings'
import { useAISuggestions } from './useAISuggestions'

export interface ExportSchemaInput {
  schema: Schema
  sourceUrl: string | null
}

export function useExport() {
  const lastEvent = ref<MappingSetExported | null>(null)

  function exportMappingSet(
    source: ExportSchemaInput,
    target: ExportSchemaInput,
  ): MappingSetExport {
    const mappingsStore = useMappings()
    const aiStore = useAISuggestions()

    const payload = serializeMappingSet({
      source,
      target,
      mappings: mappingsStore.mappings,
      aiStats: {
        totalGenerated: aiStore.totalGenerated,
        accepted: aiStore.accepted,
        rejected: aiStore.rejected,
        rejectedPairs: [...aiStore.rejectedPairs],
      },
      exportVersion: exportMetaResource.current().exportVersion + 1,
    })
    exportMetaResource.write({ ...payload.metadata })

    lastEvent.value = {
      type: 'MappingSetExported',
      payload,
      timestamp: new Date().toISOString(),
    }

    return payload
  }

  return { exportMappingSet, lastEvent }
}
