/**
 * Pure, immutable operations on a list of field mappings.
 *
 * This is the single home for mapping business rules (id generation, dedupe,
 * rule edits, restore/orphan detection). The mappings store and the non-setup
 * callers (AI accept/reject, import) apply these same functions, so behaviour
 * can't drift between the paths.
 *
 * Never mutates its input. Returns a NEW array when something actually changes
 * (so the vue-query cache gets a fresh reference and reactivity fires), and the
 * SAME input reference on a no-op (e.g. an unknown id) so callers can skip the
 * write — avoiding a spurious dirty flag, persist, and dirty-gated sync conflict.
 */
import type { FieldMapping, MismatchType, TransformationRule } from '@/types/mapping'
import type { Schema } from '@/domain/schema'
import type { ExportedFieldMapping } from '@/utils/exportSerializer'

export interface CreateMappingInput {
  sourceFieldId: string
  targetFieldId: string
}

export function makeMapping(input: CreateMappingInput): FieldMapping {
  return {
    id: crypto.randomUUID(),
    sourceFieldId: input.sourceFieldId,
    targetFieldId: input.targetFieldId,
    transformations: [],
    status: 'confirmed',
  }
}

export function isDuplicate(
  list: readonly FieldMapping[],
  sourceFieldId: string,
  targetFieldId: string,
): boolean {
  return list.some((m) => m.sourceFieldId === sourceFieldId && m.targetFieldId === targetFieldId)
}

/** Append a new mapping unless an identical source→target pair already exists. */
export function addMapping(
  list: readonly FieldMapping[],
  input: CreateMappingInput,
): { list: FieldMapping[]; created: FieldMapping | null } {
  if (isDuplicate(list, input.sourceFieldId, input.targetFieldId)) {
    return { list: list as FieldMapping[], created: null }
  }
  const created = makeMapping(input)
  return { list: [...list, created], created }
}

export function removeMapping(list: readonly FieldMapping[], id: string): FieldMapping[] {
  if (!list.some((m) => m.id === id)) return list as FieldMapping[]
  return list.filter((m) => m.id !== id)
}

export function addRule(
  list: readonly FieldMapping[],
  mappingId: string,
  rule: Omit<TransformationRule, 'id'>,
): FieldMapping[] {
  if (!list.some((m) => m.id === mappingId)) return list as FieldMapping[]
  return list.map((m) =>
    m.id === mappingId
      ? { ...m, transformations: [...m.transformations, { ...rule, id: crypto.randomUUID() }] }
      : m,
  )
}

export function removeRule(
  list: readonly FieldMapping[],
  mappingId: string,
  ruleId: string,
): FieldMapping[] {
  const mapping = list.find((m) => m.id === mappingId)
  if (!mapping || !mapping.transformations.some((r) => r.id === ruleId)) {
    return list as FieldMapping[]
  }
  return list.map((m) =>
    m.id === mappingId
      ? { ...m, transformations: m.transformations.filter((r) => r.id !== ruleId) }
      : m,
  )
}

export function updateRule(
  list: readonly FieldMapping[],
  mappingId: string,
  ruleId: string,
  updates: Partial<TransformationRule>,
): FieldMapping[] {
  const { id: _id, ...safeUpdates } = updates as TransformationRule
  const mapping = list.find((m) => m.id === mappingId)
  if (!mapping || !mapping.transformations.some((r) => r.id === ruleId)) {
    return list as FieldMapping[]
  }
  return list.map((m) => {
    if (m.id !== mappingId) return m
    return {
      ...m,
      transformations: m.transformations.map((r) =>
        r.id === ruleId ? { ...r, ...safeUpdates } : r,
      ),
    }
  })
}

export function toggleMismatch(
  list: readonly FieldMapping[],
  mappingId: string,
  type: MismatchType,
): FieldMapping[] {
  if (!list.some((m) => m.id === mappingId)) return list as FieldMapping[]
  return list.map((m) => {
    if (m.id !== mappingId) return m
    const current = m.manuallyResolvedMismatches ?? []
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    return { ...m, manuallyResolvedMismatches: next }
  })
}

/**
 * Rebuild the mapping list from an imported export payload. A mapping is
 * flagged `orphaned` when its source or target path no longer resolves against
 * the (freshly imported) schemas. New ids are minted for mappings and rules.
 */
export function restoreMappings(
  exported: readonly ExportedFieldMapping[],
  sourceSchema: Schema,
  targetSchema: Schema,
): FieldMapping[] {
  return exported.map((m) => {
    const orphaned = !sourceSchema.has(m.sourceField) || !targetSchema.has(m.targetField)
    const mapping: FieldMapping = {
      id: crypto.randomUUID(),
      sourceFieldId: m.sourceField,
      targetFieldId: m.targetField,
      transformations: m.transformations.map((t) => ({ ...t, id: crypto.randomUUID() })),
      status: 'confirmed',
    }
    if (orphaned) mapping.orphaned = true
    return mapping
  })
}
