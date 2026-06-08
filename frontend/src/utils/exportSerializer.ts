import type { Schema, SchemaField } from '@/domain/schema'
import type { FieldMapping, MismatchType, RuleSource, TransformationRule } from '@/types'

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
  sourceField: string
  targetField: string
  transformations: ExportedTransformationRule[]
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

export interface MappingSetExport {
  version: '1.1'
  exportedAt: string
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

export function serializeMappingSet(input: SerializeInput): MappingSetExport {
  const { source, target, mappings, aiStats } = input
  return {
    version: '1.1',
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    sourceSchema: serializeSchema(source.schema, source.sourceUrl),
    targetSchema: serializeSchema(target.schema, target.sourceUrl),
    fieldMappings: mappings.map((m) => ({
      sourceField: source.schema.byId(m.sourceFieldId)?.path ?? m.sourceFieldId,
      targetField: target.schema.byId(m.targetFieldId)?.path ?? m.targetFieldId,
      transformations: m.transformations.map(exportTransformationRule),
    })),
    statistics: { ai: aiStats },
  }
}
