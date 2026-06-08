import type { MappingSetExport } from '@/utils/exportSerializer'

export interface MappingSetImported {
  type: 'MappingSetImported'
  payload: MappingSetExport
  timestamp: string
}
