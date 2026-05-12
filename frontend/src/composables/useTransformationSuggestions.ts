import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SchemaField } from '@/types'
import type { TransformationSuggestionRequested } from '@/types/ai'
import { isTypeCompatible } from '@/utils/typeCompatibility'

export const useTransformationSuggestions = defineStore('transformationSuggestions', () => {
  const pendingRequests = ref<TransformationSuggestionRequested[]>([])

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

  return { pendingRequests, handleMappingCreated }
})
