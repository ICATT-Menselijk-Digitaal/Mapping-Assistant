import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FieldMapping, TransformationRule, TransformationType, ValidatedFieldMapping } from '@/types'
import type { Schema } from '@/domain/schema'
import { getValidationStatus } from '@/utils/validationStatus'
import { getRequiredRuleTypes } from '@/utils/transformationCompletion'

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
    schemas,
  }: {
    sourceFieldId: string
    targetFieldId: string
    schemas?: { source: Schema; target: Schema }
  }): FieldMapping | null {
    // Prevent exact duplicate pairs only
    const isDuplicate = mappings.value.some(
      (m) => m.sourceFieldId === sourceFieldId && m.targetFieldId === targetFieldId,
    )
    if (isDuplicate) return null

    const transformations: TransformationRule[] = [{ type: 'direct' }]

    if (schemas) {
      const sourceField = schemas.source.byId(sourceFieldId)
      const targetField = schemas.target.byId(targetFieldId)
      if (sourceField && targetField) {
        for (const type of getRequiredRuleTypes(sourceField, targetField)) {
          if (type !== 'direct') transformations.push({ type })
        }
      }
    }

    const mapping: FieldMapping = {
      id: crypto.randomUUID(),
      sourceFieldId,
      targetFieldId,
      transformations,
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
  }

  function removeTransformation(id: string, type: TransformationType): void {
    const mapping = mappings.value.find((m) => m.id === id)
    if (!mapping) return
    mapping.transformations = mapping.transformations.filter((r) => r.type !== type)
  }

  function mappingsWithStatus(sourceSchema: Schema, targetSchema: Schema): ValidatedFieldMapping[] {
    return mappings.value.map((m) => {
      const sourceField = sourceSchema.byId(m.sourceFieldId)
      const targetField = targetSchema.byId(m.targetFieldId)
      const validationStatus =
        sourceField && targetField ? getValidationStatus(sourceField, targetField) : 'constrained'
      return { ...m, validationStatus }
    })
  }

  return { mappings, selectedMappingId, hasMapping, createMapping, removeMapping, selectMapping, updateTransformation, removeTransformation, mappingsWithStatus }
})
