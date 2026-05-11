import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FieldMapping, TransformationRule, TransformationType } from '@/types'

export const useMappings = defineStore('mappings', () => {
  const mappings = ref<FieldMapping[]>([])
  const selectedMappingId = ref<string | null>(null)

  function selectMapping(id: string | null): void {
    selectedMappingId.value = id
  }

  function hasMapping(sourceFieldId: string): boolean {
    return mappings.value.some((m) => m.sourceFieldId === sourceFieldId)
  }

  function createMapping({
    sourceFieldId,
    targetFieldId,
  }: {
    sourceFieldId: string
    targetFieldId: string
  }): FieldMapping | null {
    // Prevent exact duplicate pairs only
    const isDuplicate = mappings.value.some(
      (m) => m.sourceFieldId === sourceFieldId && m.targetFieldId === targetFieldId,
    )
    if (isDuplicate) return null

    const mapping: FieldMapping = {
      id: crypto.randomUUID(),
      sourceFieldId,
      targetFieldId,
      transformations: [{ type: 'direct' }],
      status: 'confirmed',
    }

    mappings.value.push(mapping)
    return mapping
  }

  function removeMapping(id: string): void {
    mappings.value = mappings.value.filter((m) => m.id !== id)
    if (selectedMappingId.value === id) selectedMappingId.value = null
  }

  function updateTransformation(id: string, rule: TransformationRule): void {
    const mapping = mappings.value.find((m) => m.id === id)
    if (!mapping) {
      console.warn(`updateTransformation: mapping ${id} not found`)
      return
    }
    const idx = mapping.transformations.findIndex((r) => r.type === rule.type)
    if (idx >= 0) {
      mapping.transformations[idx] = rule
    } else {
      mapping.transformations.push(rule)
    }
    window.dispatchEvent(
      new CustomEvent('TransformationRuleAdded', { detail: { mappingId: id, rule } }),
    )
  }

  function removeTransformation(id: string, type: TransformationType): void {
    const mapping = mappings.value.find((m) => m.id === id)
    if (!mapping) return
    mapping.transformations = mapping.transformations.filter((r) => r.type !== type)
    window.dispatchEvent(
      new CustomEvent('TransformationRuleRemoved', { detail: { mappingId: id } }),
    )
  }

  return { mappings, selectedMappingId, hasMapping, createMapping, removeMapping, selectMapping, updateTransformation, removeTransformation }
})
