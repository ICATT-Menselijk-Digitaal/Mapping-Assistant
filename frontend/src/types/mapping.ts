export type MismatchType =
  | 'truncate'
  | 'default'
  | 'cast'
  | 'date-format'
  | 'missing-source'
  | 'missing-target'
export type RuleSource = 'manual' | 'mismatch-solution' | 'ai'

// The scalar target types a static default value can be entered against with
// strict validation. Object/array targets are deliberately excluded — they're
// resolved via a literal JSON value in the JSONata expression editor instead
// (see Feature #163's "object or array target field" edge case).
export type StaticValueDataType = 'string' | 'number' | 'boolean' | 'date'

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
// A typed static value resolving a source-less coupling's missing-source
// problem — distinct from DefaultParams, which is a source-optional/
// target-required fallback expressed as a ternary against a real source path.
export interface StaticValueParams {
  type: 'static-value'
  value: string
  dataType: StaticValueDataType
}
// Where a target-less coupling's source value goes instead of a target field
// (Feature #194) — e.g. "PDF". Resolves the coupling's missing-target problem.
export interface AlternativeStorageParams {
  type: 'alternative-storage'
  name: string
}
export type SolutionParams =
  | TruncationParams
  | DefaultParams
  | CastParams
  | DateFormatParams
  | StaticValueParams
  | AlternativeStorageParams

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
  // field with no source counterpart, resolved via a transformation rule
  // (a typed static value, or a manually-added JSONata expression) instead
  // of a source mapping.
  sourceFieldId: string | null
  // null means this is a target-less ("alternative-storage") coupling — a
  // source field whose value goes to alternative storage (e.g. a PDF)
  // instead of a target field, named via a transformation rule. Never null
  // together with sourceFieldId.
  targetFieldId: string | null
  transformations: TransformationRule[]
  status: MappingStatus
  notes?: string
  comment?: string
  commentedAt?: string // Amsterdam time, e.g. "2026-10-21 14:18:12" (see amsterdamTime.ts)
  manuallyResolvedMismatches?: MismatchType[]
  // True when restored from an import file whose source or target path
  // does not resolve against the imported schemas.
  orphaned?: boolean
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
