import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FieldMapping, MismatchType, TransformationRule, ValidatedFieldMapping } from '@/types'
import type { Schema } from '@/domain/schema'
import { analyze } from '@/domain/coupling'
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
  const selectedMappingId = ref<string | null>(null)
  const hoveredMappingId = ref<string | null>(null)
  const hoveredFieldId = ref<string | null>(null)
  // Source and target schemas are parsed independently, so a source field
  // and an unrelated target field can share the same id. Every comparison
  // against hoveredFieldId must also check hoveredFieldSide to avoid
  // matching the wrong side's field.
  const hoveredFieldSide = ref<'source' | 'target' | null>(null)
  // Bumped on every selectMapping() call, including reselecting the same
  // mapping — watchers that must fire on reselect watch this instead of
  // selectedMappingId, whose value-based watch no-ops on an unchanged id.
  const selectionNonce = ref(0)

  /** Hydrate from the remote backend for the active workspace. */
  function load(): Promise<unknown> {
    return mappingsResource.load()
  }

  function selectMapping(id: string | null): void {
    selectedMappingId.value = id
    selectionNonce.value++
  }

  // Moving the pointer from one field (or line) straight onto the next fires
  // mouseleave and mouseenter as separate events, and Vue renders after each
  // one — clearing on leave made every move render twice and briefly un-dim
  // every line in between (Feature #195). leaveHover() defers the clear by a
  // frame instead; entering anything first cancels it and replaces the whole
  // hover state in one update. The pointer is only ever over one field or
  // line, so entering one also ends any hover on the other kind.
  let pendingHoverClear: number | null = null

  function cancelPendingHoverClear(): void {
    if (pendingHoverClear === null) return
    cancelAnimationFrame(pendingHoverClear)
    pendingHoverClear = null
  }

  function hoverMapping(id: string | null): void {
    cancelPendingHoverClear()
    hoveredMappingId.value = id
    if (id) {
      hoveredFieldId.value = null
      hoveredFieldSide.value = null
    }
  }

  function hoverField(id: string | null, side: 'source' | 'target' | null = null): void {
    cancelPendingHoverClear()
    hoveredFieldId.value = id
    hoveredFieldSide.value = id ? side : null
    if (id) hoveredMappingId.value = null
  }

  /** The pointer left a field or line: clear the hover next frame, unless something else is entered first. */
  function leaveHover(): void {
    cancelPendingHoverClear()
    pendingHoverClear = requestAnimationFrame(() => {
      pendingHoverClear = null
      hoveredMappingId.value = null
      hoveredFieldId.value = null
      hoveredFieldSide.value = null
    })
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

  /** Create a source-less coupling for a target field with no source counterpart. */
  function createDefaultValueCoupling(input: { targetFieldId: string }): FieldMapping | null {
    const { list, created } = ops.addDefaultValueCoupling(mappings.value, input)
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
    if (hoveredMappingId.value === id) hoveredMappingId.value = null
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

  function setComment(mappingId: string, comment: string): void {
    commit(ops.setComment(mappings.value, mappingId, comment))
  }

  function removeComment(mappingId: string): void {
    commit(ops.removeComment(mappings.value, mappingId))
  }

  function restoreMappings(
    exported: readonly ExportedFieldMapping[],
    sourceSchema: Schema,
    targetSchema: Schema,
  ): void {
    selectedMappingId.value = null
    hoveredMappingId.value = null
    hoveredFieldId.value = null
    hoveredFieldSide.value = null
    mappingsResource.write(ops.restoreMappings(exported, sourceSchema, targetSchema))
  }

  function mappingsWithStatus(sourceSchema: Schema, targetSchema: Schema): ValidatedFieldMapping[] {
    return mappings.value.map((m) => {
      const sourceField = m.sourceFieldId ? sourceSchema.byId(m.sourceFieldId) : undefined
      const targetField = targetSchema.byId(m.targetFieldId)
      const validationStatus =
        sourceField && targetField ? analyze(sourceField, targetField).status : 'constrained'
      return { ...m, validationStatus }
    })
  }

  return {
    mappings,
    selectedMappingId,
    hoveredMappingId,
    hoveredFieldId,
    hoveredFieldSide,
    selectionNonce,
    load,
    hasMapping,
    createMapping,
    createDefaultValueCoupling,
    removeMapping,
    selectMapping,
    hoverMapping,
    hoverField,
    leaveHover,
    addTransformationRule,
    removeTransformationRule,
    updateTransformationRule,
    toggleManualMismatchResolution,
    setComment,
    removeComment,
    restoreMappings,
    mappingsWithStatus,
  }
})
