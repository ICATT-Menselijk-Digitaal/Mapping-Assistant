import type { Schema, SchemaField } from '@/domain/schema'
import type { FieldMapping, MappingStatus, TransformationRule } from '@/types'

export interface ExportedSchema {
  name: string
  sourceUrl: string | null
  // Snapshot present only when sourceUrl is null (file-loaded); reload from URL otherwise.
  fields?: SchemaField[]
}

export type ExportedTransformationRule = Omit<TransformationRule, 'id'>

export interface ExportedFieldMapping {
  sourceField: string
  targetField: string
  transformations: ExportedTransformationRule[]
  status: MappingStatus
}

export interface ExportedAIStatistics {
  totalGenerated: number
  accepted: number
  rejected: number
  rejectedPairs: string[]
}

export interface ExportedMappingStatistics {
  total: number
  confirmed: number
  rejected: number
  withTransformations: number
}

export interface ExportStatistics {
  ai: ExportedAIStatistics
  mappings: ExportedMappingStatistics
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

function serializeSchema(schema: Schema, sourceUrl: string | null): ExportedSchema {
  if (sourceUrl === null) {
    return { name: schema.name, sourceUrl: null, fields: [...schema.all()] }
  }
  return { name: schema.name, sourceUrl }
}

function computeMappingStats(mappings: FieldMapping[]): ExportedMappingStatistics {
  return {
    total: mappings.length,
    confirmed: mappings.filter((m) => m.status === 'confirmed').length,
    rejected: mappings.filter((m) => m.status === 'rejected').length,
    withTransformations: mappings.filter((m) => m.transformations.length > 0).length,
  }
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
      transformations: m.transformations.map(({ id: _id, ...rule }) => rule),
      status: m.status,
    })),
    statistics: {
      ai: aiStats,
      mappings: computeMappingStats(mappings),
    },
  }
}
