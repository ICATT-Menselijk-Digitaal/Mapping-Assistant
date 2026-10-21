import type { Schema, SchemaField } from '@/domain/schema'
import type { FieldMapping, MismatchType, RuleSource, TransformationRule } from '@/types'
import { alternativeStorageName } from '@/domain/mappingOps'
import { formatAmsterdamTime } from './amsterdamTime'

export interface ExportedSchema {
  name: string
  sourceUrl: string | null
  // Snapshot present only when sourceUrl is null (file-loaded); reload from URL otherwise.
  fields?: SchemaField[]
}

export interface ExportedTransformationRule {
  expression: string
  label: string
  source: RuleSource
  // Present when the rule was added to resolve a specific mismatch.
  resolvesMismatch?: MismatchType
  // Only present when source === 'ai'
  aiExplanation?: string
}

export interface ExportedFieldMapping {
  // null for a source-less ("default-value") coupling — a target field with
  // no source counterpart. Always a string in exports from before Feature #163.
  sourceField: string | null
  // null for a target-less ("alternative-storage") coupling — a source field
  // whose value goes to alternative storage instead (Feature #194). Always a
  // string in exports from before Feature #194.
  targetField: string | null
  // The alternative storage name (e.g. "PDF"), present once one is configured
  // on a target-less coupling. Carried here rather than as a transformation
  // rule: the migration tool has nothing to compute for it.
  alternativeStorage?: string
  transformations: ExportedTransformationRule[]
  comment?: string
  commentedAt?: string
}

export interface ExportedAIStatistics {
  totalGenerated: number
  accepted: number
  rejected: number
  rejectedPairs: string[]
}

export interface ExportStatistics {
  ai: ExportedAIStatistics
}

/** Which export this file is, and when it was produced. */
export interface ExportMetadata {
  /** Running count of exports of this coupling set; 1 on the first export. */
  exportVersion: number
  /** Amsterdam time, e.g. "2026-10-21 14:18:12" (see amsterdamTime.ts). */
  exportedAt: string
}

/** Persisted export metadata. A workspace that was never exported has no timestamp. */
export interface ExportMetaState {
  exportVersion: number
  exportedAt: string | null
}

export interface MappingSetExport {
  metadata: ExportMetadata
  sourceSchema: ExportedSchema
  targetSchema: ExportedSchema
  fieldMappings: ExportedFieldMapping[]
  statistics: ExportStatistics
}

export interface SerializeInput {
  source: { schema: Schema; sourceUrl: string | null }
  target: { schema: Schema; sourceUrl: string | null }
  mappings: FieldMapping[]
  aiStats: ExportedAIStatistics
  // Optional so tests that don't care about versioning can omit it; a standalone
  // serialisation counts as a first export. useExport always passes it.
  exportVersion?: number
  exportedAt?: string
}

function exportTransformationRule(rule: TransformationRule): ExportedTransformationRule {
  const out: ExportedTransformationRule = {
    expression: rule.expression,
    label: rule.label,
    source: rule.source,
  }
  if (rule.resolvesMismatch !== undefined) {
    out.resolvesMismatch = rule.resolvesMismatch
  }
  if (rule.source === 'ai' && rule.aiExplanation !== undefined) {
    out.aiExplanation = rule.aiExplanation
  }
  return out
}

function serializeSchema(schema: Schema, sourceUrl: string | null): ExportedSchema {
  if (sourceUrl === null) {
    return { name: schema.name, sourceUrl: null, fields: [...schema.all()] }
  }
  return { name: schema.name, sourceUrl }
}

function exportFieldMapping(
  m: FieldMapping,
  source: { schema: Schema },
  target: { schema: Schema },
): ExportedFieldMapping {
  const out: ExportedFieldMapping = {
    sourceField:
      m.sourceFieldId === null
        ? null
        : (source.schema.byId(m.sourceFieldId)?.path ?? m.sourceFieldId),
    targetField:
      m.targetFieldId === null
        ? null
        : (target.schema.byId(m.targetFieldId)?.path ?? m.targetFieldId),
    // The alternative storage name is exported as its own field below, not
    // as a rule: the migration tool has nothing to compute for it.
    transformations: m.transformations
      .filter((r) => r.resolvesMismatch !== 'missing-target')
      .map(exportTransformationRule),
  }
  const storage = m.targetFieldId === null ? alternativeStorageName(m) : undefined
  if (storage !== undefined) out.alternativeStorage = storage
  if (m.comment !== undefined) out.comment = m.comment
  if (m.commentedAt !== undefined) out.commentedAt = m.commentedAt
  return out
}

export function serializeMappingSet(input: SerializeInput): MappingSetExport {
  const { source, target, mappings, aiStats } = input
  return {
    metadata: {
      exportVersion: input.exportVersion ?? 1,
      exportedAt: input.exportedAt ?? formatAmsterdamTime(),
    },
    sourceSchema: serializeSchema(source.schema, source.sourceUrl),
    targetSchema: serializeSchema(target.schema, target.sourceUrl),
    fieldMappings: mappings.map((m) => exportFieldMapping(m, source, target)),
    statistics: { ai: aiStats },
  }
}
