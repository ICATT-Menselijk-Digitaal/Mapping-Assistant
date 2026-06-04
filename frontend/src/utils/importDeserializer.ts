import type { MappingSetExport } from './exportSerializer'

const SUPPORTED_VERSION = '1.1'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function deserializeMappingSet(raw: unknown): MappingSetExport {
  if (!isObject(raw)) throw new Error('Invalid import: payload is not an object')

  if (!('version' in raw)) throw new Error('Invalid import: missing version')
  if (raw.version !== SUPPORTED_VERSION) {
    throw new Error(`Unsupported import version: expected ${SUPPORTED_VERSION}, got ${String(raw.version)}`)
  }

  if (!isObject(raw.sourceSchema)) throw new Error('Invalid import: missing sourceSchema')
  if (!isObject(raw.targetSchema)) throw new Error('Invalid import: missing targetSchema')
  if (!Array.isArray(raw.fieldMappings)) throw new Error('Invalid import: missing fieldMappings')

  return raw as unknown as MappingSetExport
}
