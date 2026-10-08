import type { SchemaField } from '@/types/schema'
import type { StaticValueDataType } from '@/types/mapping'

export interface StaticValueValidationResult {
  valid: boolean
  error: string | null
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/

// JSONata number literals follow JSON's number grammar — stricter than
// `isFinite(Number(...))`: no leading "+", no leading zeros ("007"), a
// fractional part needs at least one digit on each side of the dot (no "1.",
// no ".5"), and no alternate bases (no "0x1A"). PR #189 review: these all
// pass `isFinite(Number(...))` but fail to parse as a JSONata literal, so a
// "valid" default value could produce an expression MIG can't evaluate.
const JSONATA_NUMBER_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/

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
      if (!JSONATA_NUMBER_PATTERN.test(trimmed)) {
        return {
          valid: false,
          error:
            'Voer een geldig getal in (bijv. 42 of 3.14 — geen voorloopnullen, +-teken of punt zonder cijfers)',
        }
      }
      return { valid: true, error: null }
    case 'boolean':
      if (trimmed !== 'true' && trimmed !== 'false') {
        return { valid: false, error: 'Voer "true" of "false" in' }
      }
      return { valid: true, error: null }
    case 'date': {
      if (!ISO_DATE_PATTERN.test(trimmed)) {
        return { valid: false, error: 'Voer een geldige datum in (notatie: JJJJ-MM-DD)' }
      }
      // `Date.parse`/`new Date(string)` silently roll an impossible calendar
      // date over into the next valid one (e.g. "2026-02-30" becomes 2 March)
      // instead of failing (PR #189 review) — reconstruct the date from its
      // own year/month/day and require it to round-trip exactly.
      const year = Number(trimmed.slice(0, 4))
      const month = Number(trimmed.slice(5, 7))
      const day = Number(trimmed.slice(8, 10))
      const reconstructed = new Date(Date.UTC(year, month - 1, day))
      if (
        reconstructed.getUTCFullYear() !== year ||
        reconstructed.getUTCMonth() + 1 !== month ||
        reconstructed.getUTCDate() !== day
      ) {
        return { valid: false, error: 'Deze datum bestaat niet' }
      }
      return { valid: true, error: null }
    }
  }
}
