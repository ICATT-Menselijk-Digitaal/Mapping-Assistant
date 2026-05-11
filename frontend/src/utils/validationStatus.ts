import type { SchemaField } from '@/types'

export type ValidationStatus = 'compatible' | 'constrained' | 'incompatible'

const INCOMPATIBLE_PAIRS = new Set([
  'object-string', 'object-number', 'object-boolean', 'object-date', 'object-array',
  'array-string', 'array-number', 'array-boolean', 'array-date', 'array-object',
  'string-object', 'number-object', 'boolean-object', 'date-object',
  'string-array', 'number-array', 'boolean-array', 'date-array',
  'boolean-date', 'date-boolean',
])

export function getValidationStatus(source: SchemaField, target: SchemaField): ValidationStatus {
  const key = `${source.dataType}-${target.dataType}`

  if (INCOMPATIBLE_PAIRS.has(key)) return 'incompatible'

  if (source.dataType === 'string' && target.dataType === 'string') {
    if (target.maxLength !== undefined) {
      if (source.maxLength === undefined || source.maxLength > target.maxLength) {
        return 'constrained'
      }
    }
  }

  if (source.dataType !== target.dataType) return 'constrained'

  if (!source.required && target.required) return 'constrained'

  return 'compatible'
}

export function getConstraintReasons(source: SchemaField, target: SchemaField): string[] {
  const reasons: string[] = []

  if (source.dataType === 'string' && target.dataType === 'string' && target.maxLength !== undefined) {
    if (source.maxLength === undefined) {
      reasons.push(`Bronveld heeft geen maximale lengte, doelveld is beperkt tot ${target.maxLength} — mogelijke afkapping`)
    } else {
      reasons.push(`Bronveld is langer dan doelveld (max. ${source.maxLength} vs ${target.maxLength}) — afkapping vereist`)
    }
  }

  if (!source.required && target.required) {
    reasons.push('Bronveld is niet verplicht, doelveld is verplicht — standaardwaarde vereist')
  }

  if (reasons.length === 0) {
    reasons.push(`${source.dataType} naar ${target.dataType} vereist transformatie`)
  }

  return reasons
}

export function getConstraintReason(source: SchemaField, target: SchemaField): string {
  return getConstraintReasons(source, target).join('; ')
}

export function getIncompatibilityReason(source: SchemaField, target: SchemaField): string {
  return `${source.dataType} kan niet worden omgezet naar ${target.dataType}`
}
