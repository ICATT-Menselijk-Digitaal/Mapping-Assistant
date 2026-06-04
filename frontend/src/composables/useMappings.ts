import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FieldMapping, MismatchType, TransformationRule, ValidatedFieldMapping } from '@/types'
import type { Schema } from '@/domain/schema'
import { getValidationStatus } from '@/utils/validationStatus'
import type { ExportedFieldMapping } from '@/utils/exportSerializer'

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
    schemas?: unknown
  }): FieldMapping | null {
    const isDuplicate = mappings.value.some(
      (m) => m.sourceFieldId === sourceFieldId && m.targetFieldId === targetFieldId,
    )
    if (isDuplicate) return null

    const mapping: FieldMapping = {
      id: crypto.randomUUID(),
      sourceFieldId,
      targetFieldId,
      transformations: [],
      status: 'confirmed',
    }

    mappings.value.push(mapping)
    return mapping
  }

  function removeMapping(id: string): void {
    mappings.value = mappings.value.filter((m) => m.id !== id)
    if (selectedMappingId.value === id) selectedMappingId.value = null
  }

  function addTransformationRule(mappingId: string, rule: Omit<TransformationRule, 'id'>): void {
    const mapping = mappings.value.find((m) => m.id === mappingId)
    if (!mapping) return
    mapping.transformations.push({ ...rule, id: crypto.randomUUID() })
  }

  function removeTransformationRule(mappingId: string, ruleId: string): void {
    const mapping = mappings.value.find((m) => m.id === mappingId)
    if (!mapping) return
    mapping.transformations = mapping.transformations.filter((r) => r.id !== ruleId)
  }

  function updateTransformationRule(
    mappingId: string,
    ruleId: string,
    updates: Partial<TransformationRule>,
  ): void {
    const mapping = mappings.value.find((m) => m.id === mappingId)
    if (!mapping) return
    const idx = mapping.transformations.findIndex((r) => r.id === ruleId)
    if (idx < 0) return
    const { id: _id, ...safeUpdates } = updates as TransformationRule
    mapping.transformations[idx] = { ...mapping.transformations[idx]!, ...safeUpdates }
  }

  function restoreMappings(
    exported: readonly ExportedFieldMapping[],
    sourceSchema: Schema,
    targetSchema: Schema,
  ): void {
    selectedMappingId.value = null
    const restored: FieldMapping[] = []
    for (const m of exported) {
      const orphaned = !sourceSchema.has(m.sourceField) || !targetSchema.has(m.targetField)
      const mapping: FieldMapping = {
        id: crypto.randomUUID(),
        sourceFieldId: m.sourceField,
        targetFieldId: m.targetField,
        transformations: m.transformations.map((t) => ({
          ...t,
          id: crypto.randomUUID(),
        })) as TransformationRule[],
        status: 'confirmed',
      }
      if (orphaned) mapping.orphaned = true
      restored.push(mapping)
    }
    mappings.value = restored
  }

  function toggleManualMismatchResolution(mappingId: string, type: MismatchType): void {
    const mapping = mappings.value.find((m) => m.id === mappingId)
    if (!mapping) return
    const current = mapping.manuallyResolvedMismatches ?? []
    mapping.manuallyResolvedMismatches = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type]
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

  return {
    mappings,
    selectedMappingId,
    hasMapping,
    createMapping,
    removeMapping,
    selectMapping,
    addTransformationRule,
    removeTransformationRule,
    updateTransformationRule,
    restoreMappings,
    toggleManualMismatchResolution,
    mappingsWithStatus,
  }
})
