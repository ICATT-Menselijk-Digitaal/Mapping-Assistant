export type MismatchType = 'truncate' | 'default' | 'cast' | 'date-format' | 'missing-source'
export type RuleSource = 'manual' | 'mismatch-solution' | 'ai'

// The scalar target types a static default value can be entered against with
// strict validation. Object/array targets are deliberately excluded — they're
// resolved via a literal JSON value in the JSONata expression editor instead
// (see Feature #163's "object or array target field" edge case).
export type StaticValueDataType = 'string' | 'number' | 'boolean' | 'date'

export interface StaticDefaultValue {
  value: string
  dataType: StaticValueDataType
}

export interface TruncationParams {
  type: 'truncate'
  maxLength: number
}
export interface DefaultParams {
  type: 'default'
  value: string
}
export interface CastParams {
  type: 'cast'
  from: string
  to: string
}
export interface DateFormatParams {
  type: 'date-format'
  sourceFormat: string
  targetFormat: string
}
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
  // null means this is a source-less ("default-value") coupling — a target
  // field with no source counterpart, resolved via `defaultValue` and/or a
  // manually-added JSONata expression instead of a source mapping.
  sourceFieldId: string | null
  targetFieldId: string
  transformations: TransformationRule[]
  status: MappingStatus
  notes?: string
  comment?: string
  commentedAt?: string // ISO 8601
  manuallyResolvedMismatches?: MismatchType[]
  // True when restored from an import file whose source or target path
  // does not resolve against the imported schemas.
  orphaned?: boolean
  // A validated static value for a source-less coupling. Presence alone means
  // "resolved" — it is only ever set after passing validation against the
  // target field's type (see utils/validateStaticValue.ts).
  defaultValue?: StaticDefaultValue
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
