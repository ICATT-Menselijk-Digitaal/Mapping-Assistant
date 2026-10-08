import type { SchemaField } from '@/types'
import type { FieldMapping, MismatchType } from '@/types/mapping'

export type MappingSide = 'source' | 'target'

export type ValidationStatus = 'compatible' | 'constrained' | 'incompatible'

export interface FieldPairAnalysis {
  status: ValidationStatus
  mismatches: MismatchType[]
}

// Type pairs that cannot be reconciled with any transformation rule — the
// coupling must be remade or rejected.
const INCOMPATIBLE_PAIRS = new Set([
  'object-string',
  'object-number',
  'object-boolean',
  'object-date',
  'object-array',
  'array-string',
  'array-number',
  'array-boolean',
  'array-date',
  'array-object',
  'string-object',
  'number-object',
  'boolean-object',
  'date-object',
  'string-array',
  'number-array',
  'boolean-array',
  'date-array',
  'boolean-date',
  'date-boolean',
])

// Type pairs where the cross-type coercion is treated as implicit — no
// user-visible mismatch is raised, and no transformation rule is required.
const CASTABLE_PAIRS = new Set(['number-string'])

function isIncompatible(source: SchemaField, target: SchemaField): boolean {
  return INCOMPATIBLE_PAIRS.has(`${source.dataType}-${target.dataType}`)
}

function detectMismatches(source: SchemaField, target: SchemaField): MismatchType[] {
  const mismatches: MismatchType[] = []
  const key = `${source.dataType}-${target.dataType}`

  if (
    source.dataType === 'string' &&
    target.dataType === 'string' &&
    target.maxLength !== undefined &&
    (source.maxLength === undefined || source.maxLength > target.maxLength)
  ) {
    mismatches.push('truncate')
  }

  if (!source.required && target.required) {
    mismatches.push('default')
  }

  if (source.dataType !== target.dataType && !CASTABLE_PAIRS.has(key)) {
    mismatches.push('cast')
  }

  // Note: no `date-format` mismatch is emitted for date → date. SchemaField
  // only knows a field is a date (OpenAPI `format: date` / `date-time`, both
  // ISO 8601) — it doesn't carry the concrete format string. Two ISO-shaped
  // dates need no conversion by default. Bring this back when SchemaField
  // starts carrying explicit format metadata that lets us detect a genuine
  // format mismatch.

  return mismatches
}

/**
 * Answer three questions about a source→target field pair in one call:
 * whether the pair can be mapped at all (`status: 'incompatible'`), whether
 * mapping it needs at least one transformation rule (`status: 'constrained'`
 * with a non-empty `mismatches` list), or whether it's a plain pass-through
 * (`status: 'compatible'`, empty `mismatches`).
 *
 * `status` is derived from `mismatches` rather than computed alongside them —
 * the earlier split (validationStatus + transformationCompletion) could return
 * `'compatible'` for date→date while also reporting a `date-format` mismatch,
 * a contradiction consumers had to reconcile themselves.
 */
export function analyze(source: SchemaField, target: SchemaField): FieldPairAnalysis {
  if (isIncompatible(source, target)) {
    return { status: 'incompatible', mismatches: [] }
  }
  // `unknown` is a parse failure, not a user-fixable transformation — mark
  // the pair as constrained but emit no mismatch card.
  if (source.dataType === 'unknown' || target.dataType === 'unknown') {
    return { status: 'constrained', mismatches: [] }
  }
  const mismatches = detectMismatches(source, target)
  const status: ValidationStatus = mismatches.length === 0 ? 'compatible' : 'constrained'
  return { status, mismatches }
}

/**
 * The persistent analysis for a source-less ("default-value") coupling: a
 * single `missing-source` mismatch that behaves nothing like a type/length
 * clash — it's always present (there will never be a source field to
 * reconcile against) and resolved the same way every other mismatch is: a
 * transformation rule tagged `resolvesMismatch: 'missing-source'` (added via
 * the "Oplossen" dialog's typed static value), or manual acknowledgement.
 */
export const DEFAULT_VALUE_REQUIRED_ANALYSIS: FieldPairAnalysis = {
  status: 'constrained',
  mismatches: ['missing-source'],
}

/**
 * Whether `type` is resolved *automatically* — by a transformation rule with
 * a non-empty expression that claims it. A freeform JSONata expression added
 * without going through a mismatch-solution dialog (`source: 'manual'`, no
 * `resolvesMismatch`) never counts — including for `missing-source` (Feature
 * #163 AC: adding an expression to a source-less coupling through the
 * generic expression editor does not by itself resolve the problem; only the
 * "Oplossen" dialog's typed static value, or manual acknowledgement, does).
 *
 * Deliberately excludes manual acknowledgement: callers that need full
 * resolution semantics (automatic OR manual) use `isResolved`. The
 * automatic-only signal lets the UI keep showing an "undo" control after a
 * manual resolution, instead of hiding it the moment the mismatch reads as
 * resolved.
 */
export function isMismatchResolved(
  type: MismatchType,
  mapping: Pick<FieldMapping, 'transformations'>,
): boolean {
  return mapping.transformations.some(
    (r) => r.resolvesMismatch === type && r.expression.trim() !== '',
  )
}

/**
 * True when every mismatch surfaced by `analyze` (or
 * `DEFAULT_VALUE_REQUIRED_ANALYSIS` for a source-less coupling) is resolved
 * on `mapping` — automatically or by manual acknowledgement. An incompatible
 * pair is never resolved — no rule reconciles a fundamental type clash.
 */
export function isResolved(
  analysis: FieldPairAnalysis,
  mapping: Pick<FieldMapping, 'transformations' | 'manuallyResolvedMismatches'>,
): boolean {
  if (analysis.status === 'incompatible') return false
  const manuallyResolved = mapping.manuallyResolvedMismatches ?? []
  return analysis.mismatches.every(
    (type) => isMismatchResolved(type, mapping) || manuallyResolved.includes(type),
  )
}
