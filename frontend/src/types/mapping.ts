export type MismatchType = 'truncate' | 'default' | 'cast' | 'date-format'
export type RuleSource = 'manual' | 'mismatch-solution' | 'ai'

export interface TruncationParams { type: 'truncate'; maxLength: number }
export interface DefaultParams    { type: 'default';  value: string }
export interface CastParams       { type: 'cast';     from: string; to: string }
export interface DateFormatParams { type: 'date-format'; sourceFormat: string; targetFormat: string }
export type SolutionParams = TruncationParams | DefaultParams | CastParams | DateFormatParams

export interface TransformationRule {
  id: string
  expression: string
  label: string
  source: RuleSource
  resolvesMismatch?: MismatchType
  solutionParams?: SolutionParams
  aiExplanation?: string
}

export type MappingStatus = 'confirmed' | 'rejected'

export interface FieldMapping {
  id: string
  sourceFieldId: string
  targetFieldId: string
  transformations: TransformationRule[]
  status: MappingStatus
  notes?: string
  manuallyResolvedMismatches?: MismatchType[]
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
