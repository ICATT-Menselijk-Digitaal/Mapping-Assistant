/**
 * vue-query hooks for field mappings.
 *
 * Reads go through useMappingsQuery(). Writes are applied optimistically to the
 * cache by the facade (useMappingsData) and persisted through
 * useSaveMappingsMutation — so the synchronous create-and-use contract the app
 * relies on is preserved even when the backend is a remote, async store.
 */
import { useMutation, useQuery } from '@tanstack/vue-query'
import type { FieldMapping } from '@/types/mapping'
import { mappingsApi } from '@/api/mappingsApi'
import { queryKeys } from './queryKeys'

export function useMappingsQuery() {
  return useQuery({
    queryKey: queryKeys.mappings,
    queryFn: () => mappingsApi.list(),
  })
}

export function useSaveMappingsMutation() {
  return useMutation({
    mutationFn: (mappings: FieldMapping[]) => mappingsApi.save(mappings),
  })
}
