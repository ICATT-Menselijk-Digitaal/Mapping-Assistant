import type { MappingSetExport } from './exportSerializer'

const SUPPORTED_VERSION = '1.1'

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportFormatError'
  }
}

export interface DeserializeResult {
  payload: MappingSetExport
  warnings: string[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function deserializeMappingSet(raw: unknown): DeserializeResult {
  if (!isObject(raw)) throw new ImportFormatError('Invalid import: payload is not an object')

  if (!('version' in raw)) throw new ImportFormatError('Invalid import: missing version')

  const warnings: string[] = []
  if (raw.version !== SUPPORTED_VERSION) {
    warnings.push(
      `Unknown import version: expected ${SUPPORTED_VERSION}, got ${String(raw.version)}. Attempting to import anyway.`,
    )
  }

  if (!isObject(raw.sourceSchema))
    throw new ImportFormatError('Invalid import: missing sourceSchema')
  if (!isObject(raw.targetSchema))
    throw new ImportFormatError('Invalid import: missing targetSchema')
  if (!Array.isArray(raw.fieldMappings))
    throw new ImportFormatError('Invalid import: missing fieldMappings')

  return { payload: raw as unknown as MappingSetExport, warnings }
}
