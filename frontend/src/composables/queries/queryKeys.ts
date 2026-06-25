/**
 * Central registry of query keys. Keeping them in one place avoids typos and
 * makes invalidation targets explicit across the app.
 */
export const queryKeys = {
  mappings: ['mappings'] as const,
  schemas: {
    source: ['schemas', 'source'] as const,
    target: ['schemas', 'target'] as const,
  },
  aiStats: ['ai', 'stats'] as const,
  aiSuggestions: ['ai', 'suggestions'] as const,
} as const
