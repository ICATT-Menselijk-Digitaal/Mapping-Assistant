export type TransformationType = 'direct' | 'static' | 'expression' | 'truncate' | 'default' | 'cast' | 'date-format'

export type MappingStatus = 'confirmed' | 'rejected'

export type TransformationRule =
  | { type: 'direct' }
  | { type: 'static';       staticValue?: string }
  | { type: 'expression';   expression?: string }
  | { type: 'truncate';     truncationMaxLength?: number }
  | { type: 'default';      defaultValue?: string }
  | { type: 'cast';         castFrom?: string; castTo?: string }
  | { type: 'date-format';  sourceDateFormat?: string; targetDateFormat?: string }

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
