import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FieldMapping, MismatchType, TransformationRule, ValidatedFieldMapping } from '@/types'
import type { Schema } from '@/domain/schema'
import { getValidationStatus } from '@/utils/validationStatus'
import type { ExportedFieldMapping } from '@/utils/exportSerializer'
import { mappingsResource } from '@/api/resources'
import * as ops from '@/domain/mappingOps'

/**
 * Field-mapping state, backed by the shared mappings resource (vue-query cache +
 * remote backend). The public API is unchanged from the original in-memory store
 * — synchronous methods, `createMapping` returns the created mapping — so every
 * consumer keeps working. Each write is optimistic: the resource updates the
 * cache synchronously and persists in the background. Business rules live in
 * domain/mappingOps.ts; persistence + conflict policy live in the resource.
 */
export const useMappings = defineStore('mappings', () => {
  const mappings = mappingsResource.state
  const remoteAhead = mappingsResource.remoteAhead
  const selectedMappingId = ref<string | null>(null)

  /** Hydrate from the remote backend for the active workspace. */
  function load(): Promise<unknown> {
    return mappingsResource.load()
  }

  /** Apply a remote change that arrived while the user had unsaved edits. */
  function acceptRemoteUpdate(): void {
    mappingsResource.acceptRemote()
  }

  function selectMapping(id: string | null): void {
    selectedMappingId.value = id
  }

  function hasMapping(sourceFieldId: string): boolean {
    return mappings.value.some((m) => m.sourceFieldId === sourceFieldId)
  }

  function createMapping(input: {
    sourceFieldId: string
    targetFieldId: string
    schemas?: unknown
  }): FieldMapping | null {
    const { list, created } = ops.addMapping(mappings.value, input)
    if (created) mappingsResource.write(list)
    return created
  }

  // Persist only when an op actually changed the list. The ops return the SAME
  // reference on a no-op (unknown id), so an edit targeting something that
  // doesn't exist won't mark the resource dirty or schedule a spurious persist /
  // dirty-gated sync conflict.
  function commit(next: FieldMapping[]): void {
    if (next !== mappings.value) mappingsResource.write(next)
  }

  function removeMapping(id: string): void {
    commit(ops.removeMapping(mappings.value, id))
    if (selectedMappingId.value === id) selectedMappingId.value = null
  }

  function addTransformationRule(mappingId: string, rule: Omit<TransformationRule, 'id'>): void {
    commit(ops.addRule(mappings.value, mappingId, rule))
  }

  function removeTransformationRule(mappingId: string, ruleId: string): void {
    commit(ops.removeRule(mappings.value, mappingId, ruleId))
  }

  function updateTransformationRule(
    mappingId: string,
    ruleId: string,
    updates: Partial<TransformationRule>,
  ): void {
    commit(ops.updateRule(mappings.value, mappingId, ruleId, updates))
  }

  function toggleManualMismatchResolution(mappingId: string, type: MismatchType): void {
    commit(ops.toggleMismatch(mappings.value, mappingId, type))
  }

  function restoreMappings(
    exported: readonly ExportedFieldMapping[],
    sourceSchema: Schema,
    targetSchema: Schema,
  ): void {
    selectedMappingId.value = null
    mappingsResource.write(ops.restoreMappings(exported, sourceSchema, targetSchema))
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
    remoteAhead,
    selectedMappingId,
    load,
    acceptRemoteUpdate,
    hasMapping,
    createMapping,
    removeMapping,
    selectMapping,
    addTransformationRule,
    removeTransformationRule,
    updateTransformationRule,
    toggleManualMismatchResolution,
    restoreMappings,
    mappingsWithStatus,
  }
})
