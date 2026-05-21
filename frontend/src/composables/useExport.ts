import { ref } from 'vue'
import type { Schema } from '@/domain/schema'
import type { MappingSetExported } from '@/domain/events/MappingSetExported'
import type { MappingSetExport } from '@/utils/exportSerializer'
import { serializeMappingSet } from '@/utils/exportSerializer'
import { useMappings } from './useMappings'

export function useExport() {
  const lastEvent = ref<MappingSetExported | null>(null)

  function exportMappingSet(sourceSchema: Schema, targetSchema: Schema): MappingSetExport {
    const mappingsStore = useMappings()
    const payload = serializeMappingSet(sourceSchema, targetSchema, mappingsStore.mappings)

    lastEvent.value = {
      type: 'MappingSetExported',
      payload,
      timestamp: new Date().toISOString(),
    }

    return payload
  }

  return { exportMappingSet, lastEvent }
}
