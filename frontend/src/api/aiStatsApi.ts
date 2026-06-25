/**
 * Persistence for the accumulated AI statistics (counts + rejected pairs).
 * The transient suggestion lists are not persisted — only the bookkeeping that
 * should survive a reload and follow the workspace across devices.
 */
import type { ExportedAIStatistics } from '@/utils/exportSerializer'
import { get as backendGet, set as backendSet } from './remoteBackend'

const AI_STATS_KEY = 'aiStats'

export function emptyAiStats(): ExportedAIStatistics {
  return { totalGenerated: 0, accepted: 0, rejected: 0, rejectedPairs: [] }
}

export const aiStatsApi = {
  get(): Promise<ExportedAIStatistics> {
    return backendGet<ExportedAIStatistics>(AI_STATS_KEY, emptyAiStats())
  },

  async set(stats: ExportedAIStatistics): Promise<ExportedAIStatistics> {
    await backendSet(AI_STATS_KEY, stats)
    return stats
  },

  async addGenerated(count: number): Promise<ExportedAIStatistics> {
    const stats = await this.get()
    return this.set({ ...stats, totalGenerated: stats.totalGenerated + count })
  },

  async recordAccepted(): Promise<ExportedAIStatistics> {
    const stats = await this.get()
    return this.set({ ...stats, accepted: stats.accepted + 1 })
  },

  async recordRejected(pairKey: string): Promise<ExportedAIStatistics> {
    const stats = await this.get()
    const rejectedPairs = stats.rejectedPairs.includes(pairKey)
      ? stats.rejectedPairs
      : [...stats.rejectedPairs, pairKey]
    return this.set({ ...stats, rejected: stats.rejected + 1, rejectedPairs })
  },
}
