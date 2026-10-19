import type { ExportMetaState, MappingSetExport } from './exportSerializer'

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportFormatError'
  }
}

export interface DeserializeResult {
  payload: MappingSetExport
  /**
   * The file's export metadata, normalised. Kept apart from `payload` because an
   * older export has no timestamp, which `MappingSetExport.metadata` can't express.
   */
  exportMeta: ExportMetaState
  warnings: string[]
}

const NEVER_EXPORTED: ExportMetaState = { exportVersion: 0, exportedAt: null }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const UNREADABLE_EXPORT_VERSION_WARNING =
  'De exportversie in dit bestand is onleesbaar. De volgende export krijgt versie 1.'

function isExportVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

// Exports from before Feature #198 have no metadata block: they count as
// export version 0, so the next export becomes version 1. A metadata block
// whose version can't be read is treated the same way, but with a warning.
function readExportMeta(metadata: unknown, warnings: string[]): ExportMetaState {
  if (metadata === undefined) return { ...NEVER_EXPORTED }
  if (!isObject(metadata) || !isExportVersion(metadata.exportVersion)) {
    warnings.push(UNREADABLE_EXPORT_VERSION_WARNING)
    return { ...NEVER_EXPORTED }
  }
  return {
    exportVersion: metadata.exportVersion,
    exportedAt: typeof metadata.exportedAt === 'string' ? metadata.exportedAt : null,
  }
}

export function deserializeMappingSet(raw: unknown): DeserializeResult {
  if (!isObject(raw)) throw new ImportFormatError('Invalid import: payload is not an object')

  const warnings: string[] = []

  if (!isObject(raw.sourceSchema))
    throw new ImportFormatError('Invalid import: missing sourceSchema')
  if (!isObject(raw.targetSchema))
    throw new ImportFormatError('Invalid import: missing targetSchema')
  if (!Array.isArray(raw.fieldMappings))
    throw new ImportFormatError('Invalid import: missing fieldMappings')

  const exportMeta = readExportMeta(raw.metadata, warnings)

  return { payload: raw as unknown as MappingSetExport, exportMeta, warnings }
}
