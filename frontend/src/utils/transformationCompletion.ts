import type { SchemaField } from '@/types'
import type { FieldMapping, MismatchType, TransformationRule } from '@/types/mapping'
import { getValidationStatus } from '@/utils/validationStatus'

export function getMismatchTypes(source: SchemaField, target: SchemaField): MismatchType[] {
  const mismatches: MismatchType[] = []
  const status = getValidationStatus(source, target)

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

  if (source.dataType !== target.dataType && status !== 'incompatible') {
    mismatches.push('cast')
  }

  if (source.dataType === 'date' && target.dataType === 'date') {
    mismatches.push('date-format')
  }

  return mismatches
}

export function isMismatchResolved(
  type: MismatchType,
  transformations: TransformationRule[],
  manuallyResolvedMismatches?: MismatchType[],
): boolean {
  return (
    transformations.some((r) => r.resolvesMismatch === type && r.expression.trim() !== '') ||
    (manuallyResolvedMismatches?.includes(type) ?? false)
  )
}

export function isMappingComplete(
  mapping: FieldMapping,
  source: SchemaField,
  target: SchemaField,
): boolean {
  return getMismatchTypes(source, target).every((type) =>
    isMismatchResolved(type, mapping.transformations, mapping.manuallyResolvedMismatches),
  )
}
