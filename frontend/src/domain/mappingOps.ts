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

/** True when `targetFieldId` already carries any coupling — source-bound or source-less. */
export function hasCouplingForTarget(
  list: readonly FieldMapping[],
  targetFieldId: string,
): boolean {
  return list.some((m) => m.targetFieldId === targetFieldId)
}

/**
 * Append a new mapping unless the target field already carries any coupling —
 * a target is covered by at most one `FieldMapping` at a time (PR #189
 * review: this used to dedupe only on the exact source+target pair, which let
 * two different sources both map to the same target, or a source-bound
 * mapping silently coexist with an already-resolved default-value coupling).
 * Replacing an existing coupling with a new one is a UI-level decision
 * (`MappingCanvas`'s replace-confirmation) — this function only enforces that
 * "at most one" never gets silently violated, regardless of caller.
 */
export function addMapping(
  list: readonly FieldMapping[],
  input: CreateMappingInput,
): { list: FieldMapping[]; created: FieldMapping | null } {
  if (hasCouplingForTarget(list, input.targetFieldId)) {
    return { list: list as FieldMapping[], created: null }
  }
  const created = makeMapping(input)
  return { list: [...list, created], created }
}

export interface CreateDefaultValueCouplingInput {
  targetFieldId: string
}

/** A source-less coupling: a target field with no source, pending a default value or expression. */
export function makeDefaultValueCoupling(input: CreateDefaultValueCouplingInput): FieldMapping {
  return {
    id: crypto.randomUUID(),
    sourceFieldId: null,
    targetFieldId: input.targetFieldId,
    transformations: [],
    status: 'confirmed',
  }
}

/**
 * Append a new source-less coupling unless the target field already carries
 * any coupling — source-bound or source-less (Feature #163 edge case:
 * double-clicking an already-mapped target performs normal selection
 * instead).
 */
export function addDefaultValueCoupling(
  list: readonly FieldMapping[],
  input: CreateDefaultValueCouplingInput,
): { list: FieldMapping[]; created: FieldMapping | null } {
  if (hasCouplingForTarget(list, input.targetFieldId)) {
    return { list: list as FieldMapping[], created: null }
  }
  const created = makeDefaultValueCoupling(input)
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

export const MAX_COMMENT_LENGTH = 1000

/** Set (or overwrite) a mapping's comment, refreshing its timestamp. */
export function setComment(
  list: readonly FieldMapping[],
  mappingId: string,
  comment: string,
): FieldMapping[] {
  if (!list.some((m) => m.id === mappingId)) return list as FieldMapping[]
  const trimmed = comment.slice(0, MAX_COMMENT_LENGTH)
  return list.map((m) =>
    m.id === mappingId ? { ...m, comment: trimmed, commentedAt: new Date().toISOString() } : m,
  )
}

export function removeComment(list: readonly FieldMapping[], mappingId: string): FieldMapping[] {
  const mapping = list.find((m) => m.id === mappingId)
  if (!mapping || mapping.comment === undefined) return list as FieldMapping[]
  return list.map((m) => {
    if (m.id !== mappingId) return m
    const { comment: _comment, commentedAt: _commentedAt, ...rest } = m
    return rest
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
    // A source-less coupling (m.sourceField === null) is never orphaned on
    // its source side — there was never a source field to lose.
    const orphaned =
      (m.sourceField !== null && !sourceSchema.has(m.sourceField)) ||
      !targetSchema.has(m.targetField)
    const mapping: FieldMapping = {
      id: crypto.randomUUID(),
      sourceFieldId: m.sourceField,
      targetFieldId: m.targetField,
      transformations: m.transformations.map((t) => ({ ...t, id: crypto.randomUUID() })),
      status: 'confirmed',
    }
    if (orphaned) mapping.orphaned = true
    if (m.comment !== undefined) mapping.comment = m.comment
    if (m.commentedAt !== undefined) mapping.commentedAt = m.commentedAt
    return mapping
  })
}
