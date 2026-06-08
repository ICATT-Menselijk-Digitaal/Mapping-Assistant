import type { MappingSetExport } from '@/utils/exportSerializer'

export interface MappingSetExported {
  type: 'MappingSetExported'
  payload: MappingSetExport
  timestamp: string
}
