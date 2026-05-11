export type TransformationType = 'direct' | 'static' | 'expression' | 'truncate' | 'default' | 'cast' | 'date-format'

export type MappingStatus = 'confirmed' | 'rejected'

export interface TransformationRule {
  type: TransformationType
  staticValue?: string // used when type === 'static'
  expression?: string  // used when type === 'expression' (e.g. JSONata)
  truncationMaxLength?: number // used when type === 'truncate'
  defaultValue?: string // used when type === 'default'
  castFrom?: string // used when type === 'cast'
  castTo?: string // used when type === 'cast'
  sourceDateFormat?: string // used when type === 'date-format'
  targetDateFormat?: string // used when type === 'date-format'
}

export interface FieldMapping {
  id: string
  sourceFieldId: string
  targetFieldId: string
  transformations: TransformationRule[]
  status: MappingStatus
  notes?: string
}

export interface ValidatedFieldMapping extends FieldMapping {
  validationStatus: 'compatible' | 'constrained' | 'incompatible'
}

export interface MappingSet {
  id: string
  name: string
  sourceSchemaId: string
  targetSchemaId: string
  mappings: FieldMapping[]
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}
