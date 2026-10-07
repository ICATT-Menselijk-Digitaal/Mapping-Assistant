import type { SchemaField } from '@/types/schema'
import type { StaticValueDataType } from '@/types/mapping'

export interface StaticValueValidationResult {
  valid: boolean
  error: string | null
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/

/**
 * True for the scalar target types a static default value can be validated
 * against directly. Object/array targets are deliberately excluded — a
 * literal JSON value entered in the JSONata expression editor covers those
 * instead (see Feature #163's object/array edge case).
 */
export function supportsStaticValue(
  dataType: SchemaField['dataType'],
): dataType is StaticValueDataType {
  return (
    dataType === 'string' || dataType === 'number' || dataType === 'boolean' || dataType === 'date'
  )
}

/**
 * Validate a literal value typed by the Technical Administrator against a
 * target field's expected type. Mirrors the pre-rewrite default-value input's
 * per-dataType checks (commit 1d65218), extended to boolean and date.
 */
export function validateStaticValue(
  value: string,
  dataType: StaticValueDataType,
  constraints: { maxLength?: number } = {},
): StaticValueValidationResult {
  const trimmed = value.trim()
  if (trimmed === '') {
    return { valid: false, error: 'Voer een waarde in' }
  }

  switch (dataType) {
    case 'string':
      if (constraints.maxLength !== undefined && trimmed.length > constraints.maxLength) {
        return {
          valid: false,
          error: `Waarde is langer dan de maximale lengte van ${constraints.maxLength}`,
        }
      }
      return { valid: true, error: null }
    case 'number':
      if (!isFinite(Number(trimmed))) {
        return { valid: false, error: 'Voer een geldig getal in' }
      }
      return { valid: true, error: null }
    case 'boolean':
      if (trimmed !== 'true' && trimmed !== 'false') {
        return { valid: false, error: 'Voer "true" of "false" in' }
      }
      return { valid: true, error: null }
    case 'date':
      if (!ISO_DATE_PATTERN.test(trimmed) || isNaN(Date.parse(trimmed))) {
        return { valid: false, error: 'Voer een geldige datum in (notatie: JJJJ-MM-DD)' }
      }
      return { valid: true, error: null }
  }
}
