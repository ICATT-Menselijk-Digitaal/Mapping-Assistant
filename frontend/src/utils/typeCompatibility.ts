import type { SchemaField } from '@/types'

export function isTypeCompatible(source: SchemaField, target: SchemaField): boolean {
  if (source.dataType === 'unknown' || target.dataType === 'unknown') return false
  return source.dataType === target.dataType
}
