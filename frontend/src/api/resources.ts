/**
 * The persisted entities, each behind the same remote-resource seam. This is the
 * one place that names a storage key + codec per entity; stores and composables
 * consume the resources and never touch the backend directly.
 */
import { EMPTY_SCHEMA, type Schema } from '@/domain/schema'
import { buildSchemaFromFields } from '@/utils/schemaFromFields'
import type { SchemaField } from '@/types/schema'
import type { FieldMapping } from '@/types/mapping'
import type { ExportedAIStatistics } from '@/utils/exportSerializer'
import { queryKeys } from '@/composables/queries/queryKeys'
import { defineRemoteResource, type ResourceCodec } from './resource'

/** Flat, serialisable form of a loaded schema (the runtime Schema has methods). */
export interface StoredSchema {
  name: string
  sourceUrl: string | null
  fields: SchemaField[]
}

/** A loaded schema plus where it came from — the schema resource's domain value. */
export interface SchemaSnapshot {
  schema: Schema
  sourceUrl: string | null
}

function emptySnapshot(): SchemaSnapshot {
  return { schema: EMPTY_SCHEMA, sourceUrl: null }
}

// The runtime Schema is a frozen object with methods and is not serialisable, so
// we store the flat field list and rebuild the Schema on read.
const schemaCodec: ResourceCodec<SchemaSnapshot, StoredSchema> = {
  encode: (snapshot) => ({
    name: snapshot.schema.name,
    sourceUrl: snapshot.sourceUrl,
    fields: [...snapshot.schema.all()],
  }),
  decode: (stored) => ({
    schema: buildSchemaFromFields(stored.name, stored.fields),
    sourceUrl: stored.sourceUrl,
  }),
}

export function emptyAiStats(): ExportedAIStatistics {
  return { totalGenerated: 0, accepted: 0, rejected: 0, rejectedPairs: [] }
}

export const mappingsResource = defineRemoteResource<FieldMapping[]>({
  key: queryKeys.mappings,
  storageKey: 'mappings',
  initial: () => [],
})

export const sourceSchemaResource = defineRemoteResource<SchemaSnapshot, StoredSchema>({
  key: queryKeys.schemas.source,
  storageKey: 'sourceSchema',
  initial: emptySnapshot,
  codec: schemaCodec,
})

export const targetSchemaResource = defineRemoteResource<SchemaSnapshot, StoredSchema>({
  key: queryKeys.schemas.target,
  storageKey: 'targetSchema',
  initial: emptySnapshot,
  codec: schemaCodec,
})

export const aiStatsResource = defineRemoteResource<ExportedAIStatistics>({
  key: queryKeys.aiStats,
  storageKey: 'aiStats',
  initial: emptyAiStats,
})
