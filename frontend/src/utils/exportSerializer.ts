import type { Schema, SchemaField } from '@/domain/schema'
import type { FieldMapping } from '@/types'

export interface ExportedSchema {
  name: string
  fields: SchemaField[]
}

export interface ExportedFieldMapping {
  sourceField: string
  targetField: string
}

export interface MappingSetExport {
  version: '1.0'
  sourceSchema: ExportedSchema
  targetSchema: ExportedSchema
  fieldMappings: ExportedFieldMapping[]
}

export function serializeMappingSet(
  sourceSchema: Schema,
  targetSchema: Schema,
  mappings: FieldMapping[],
): MappingSetExport {
  return {
    version: '1.0',
    sourceSchema: { name: sourceSchema.name, fields: [...sourceSchema.all()] },
    targetSchema: { name: targetSchema.name, fields: [...targetSchema.all()] },
    fieldMappings: mappings.map((m) => ({
      sourceField: sourceSchema.byId(m.sourceFieldId)?.path ?? m.sourceFieldId,
      targetField: targetSchema.byId(m.targetFieldId)?.path ?? m.targetFieldId,
    })),
  }
}
