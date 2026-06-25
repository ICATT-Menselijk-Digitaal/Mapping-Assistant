/**
 * Persistence for the loaded source/target schemas.
 *
 * The runtime Schema is a frozen object with methods and is not serialisable,
 * so we store a flat StoredSchema (name + provenance + field list) and rebuild
 * the Schema via buildSchemaFromFields on read.
 */
import { EMPTY_SCHEMA, type Schema } from '@/domain/schema'
import { buildSchemaFromFields } from '@/utils/schemaFromFields'
import type { SchemaField } from '@/types/schema'
import { get, set } from './remoteBackend'

export interface StoredSchema {
  name: string
  sourceUrl: string | null
  fields: SchemaField[]
}

export interface SchemaSnapshot {
  schema: Schema
  sourceUrl: string | null
}

const SOURCE_KEY = 'sourceSchema'
const TARGET_KEY = 'targetSchema'

function toSnapshot(stored: StoredSchema | null): SchemaSnapshot {
  if (!stored) return { schema: EMPTY_SCHEMA, sourceUrl: null }
  return { schema: buildSchemaFromFields(stored.name, stored.fields), sourceUrl: stored.sourceUrl }
}

export const schemasApi = {
  async getSource(): Promise<SchemaSnapshot> {
    return toSnapshot(await get<StoredSchema | null>(SOURCE_KEY, null))
  },

  async getTarget(): Promise<SchemaSnapshot> {
    return toSnapshot(await get<StoredSchema | null>(TARGET_KEY, null))
  },

  async setSource(stored: StoredSchema | null): Promise<SchemaSnapshot> {
    await set(SOURCE_KEY, stored)
    return toSnapshot(stored)
  },

  async setTarget(stored: StoredSchema | null): Promise<SchemaSnapshot> {
    await set(TARGET_KEY, stored)
    return toSnapshot(stored)
  },
}
