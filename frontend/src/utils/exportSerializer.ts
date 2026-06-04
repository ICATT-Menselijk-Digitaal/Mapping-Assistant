import type { Schema, SchemaField } from '@/domain/schema'
import type { FieldMapping, RuleSource, TransformationRule } from '@/types'

export interface ExportedSchema {
  name: string
  sourceUrl: string | null
  // Snapshot present only when sourceUrl is null (file-loaded); reload from URL otherwise.
  fields?: SchemaField[]
  selectedEndpoint?: { path: string; method: string }
}

export interface ExportedTransformationRule {
  expression: string
  label: string
  source: RuleSource
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
  source: { schema: Schema; sourceUrl: string | null; selectedEndpoint?: { path: string; method: string } | null }
  target: { schema: Schema; sourceUrl: string | null; selectedEndpoint?: { path: string; method: string } | null }
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
  if (rule.source === 'ai' && rule.aiExplanation !== undefined) {
    out.aiExplanation = rule.aiExplanation
  }
  return out
}

function serializeSchema(
  schema: Schema,
  sourceUrl: string | null,
  selectedEndpoint?: { path: string; method: string } | null,
): ExportedSchema {
  const base: ExportedSchema = sourceUrl === null
    ? { name: schema.name, sourceUrl: null, fields: [...schema.all()] }
    : { name: schema.name, sourceUrl }
  if (selectedEndpoint) {
    base.selectedEndpoint = { path: selectedEndpoint.path, method: selectedEndpoint.method }
  }
  return base
}

export function serializeMappingSet(input: SerializeInput): MappingSetExport {
  const { source, target, mappings, aiStats } = input
  return {
    version: '1.1',
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    sourceSchema: serializeSchema(source.schema, source.sourceUrl, source.selectedEndpoint),
    targetSchema: serializeSchema(target.schema, target.sourceUrl, target.selectedEndpoint),
    fieldMappings: mappings.map((m) => ({
      sourceField: source.schema.byId(m.sourceFieldId)?.path ?? m.sourceFieldId,
      targetField: target.schema.byId(m.targetFieldId)?.path ?? m.targetFieldId,
      transformations: m.transformations.map(exportTransformationRule),
    })),
    statistics: { ai: aiStats },
  }
}
