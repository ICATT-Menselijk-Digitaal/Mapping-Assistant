import { QueryClient } from '@tanstack/vue-query'

/**
 * Single QueryClient instance, created outside any component so it can be both
 * installed via VueQueryPlugin AND imported directly by non-setup code
 * (stores, the api layer, other modules) to call invalidateQueries /
 * setQueryData without needing Vue's inject() context.
 *
 * Defaults are tuned for the current localStorage backend: data only changes
 * through our own mutations, so queries never go stale on their own and there
 * is nothing to retry against. Revisit staleTime/retry when a real network
 * backend is wired in.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})
