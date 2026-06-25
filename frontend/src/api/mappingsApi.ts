/**
 * Persistence for field mappings. Reads the whole list or replaces it. All
 * business logic lives in domain/mappingOps.ts; this only moves data to/from
 * the remote backend (scoped by the active workspace code).
 */
import type { FieldMapping } from '@/types/mapping'
import { get, set } from './remoteBackend'

const MAPPINGS_KEY = 'mappings'

export const mappingsApi = {
  list(): Promise<FieldMapping[]> {
    return get<FieldMapping[]>(MAPPINGS_KEY, [])
  },

  async save(mappings: FieldMapping[]): Promise<FieldMapping[]> {
    await set(MAPPINGS_KEY, mappings)
    return mappings
  },
}
