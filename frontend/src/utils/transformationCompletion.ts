import type { SchemaField } from '@/types'
import type { FieldMapping, TransformationRule, TransformationType } from '@/types/mapping'
import { getValidationStatus } from '@/utils/validationStatus'

export function isRuleComplete(rule: TransformationRule): boolean {
  switch (rule.type) {
    case 'direct':      return true
    case 'static':      return typeof rule.staticValue === 'string' && rule.staticValue.trim() !== ''
    case 'expression':  return typeof rule.expression === 'string' && rule.expression.trim() !== ''
    case 'truncate':    return typeof rule.truncationMaxLength === 'number' && rule.truncationMaxLength >= 4
    case 'default':     return typeof rule.defaultValue === 'string' && rule.defaultValue.trim() !== ''
    case 'cast':        return typeof rule.castFrom === 'string' && typeof rule.castTo === 'string'
    case 'date-format': return (
                          typeof rule.sourceDateFormat === 'string' && rule.sourceDateFormat.trim() !== '' &&
                          typeof rule.targetDateFormat === 'string' && rule.targetDateFormat.trim() !== ''
                        )
  }
}

export function getRequiredRuleTypes(source: SchemaField, target: SchemaField): TransformationType[] {
  const required: TransformationType[] = ['direct']
  const status = getValidationStatus(source, target)

  if (
    source.dataType === 'string' &&
    target.dataType === 'string' &&
    target.maxLength !== undefined &&
    (source.maxLength === undefined || source.maxLength > target.maxLength)
  ) {
    required.push('truncate')
  }

  if (!source.required && target.required) {
    required.push('default')
  }

  if (source.dataType !== target.dataType && status !== 'incompatible') {
    required.push('cast')
  }

  if (source.dataType === 'date' && target.dataType === 'date') {
    required.push('date-format')
  }

  return required
}

export function isMappingComplete(
  mapping: FieldMapping,
  source: SchemaField,
  target: SchemaField,
): boolean {
  const required = getRequiredRuleTypes(source, target)
  return required.every((type) => {
    const rule = mapping.transformations.find((r) => r.type === type)
    return rule !== undefined && isRuleComplete(rule)
  })
}
