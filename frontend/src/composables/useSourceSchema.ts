import { computed, ref } from 'vue'
import * as yaml from 'js-yaml'
import { EMPTY_SCHEMA, type Schema } from '@/domain/schema'
import { parseOpenApiSchema } from '@/utils/openApiParser'
import { buildSchemaFromFields } from '@/utils/schemaFromFields'
import type { ExportedSchema } from '@/utils/exportSerializer'
import { sourceSchemaResource } from '@/api/resources'

/**
 * Source-schema state. `schema`/`sourceUrl` are reactive projections of the
 * shared source-schema resource (cache + remote backend); file/URL parsing and
 * transient error/loading flags stay local. Loading a schema writes through the
 * resource, so it persists and follows the workspace across devices.
 */
export function useSourceSchema() {
  const schema = computed<Schema>(() => sourceSchemaResource.state.value.schema)
  const sourceUrl = computed<string | null>(() => sourceSchemaResource.state.value.sourceUrl)
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  function applySchema(nextSchema: Schema, nextSourceUrl: string | null): void {
    sourceSchemaResource.write({ schema: nextSchema, sourceUrl: nextSourceUrl })
  }

  function parseContent(content: string): Schema {
    let spec: unknown
    try {
      spec = yaml.load(content)
    } catch {
      throw new Error('Ongeldig bestand: geen geldige YAML, JSON of OpenAPI-spec')
    }
    return parseOpenApiSchema(spec)
  }

  async function loadFromFile(file: File): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const parsed = parseContent(await file.text())
      applySchema(parsed, null)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Kon bestand niet verwerken'
      applySchema(EMPTY_SCHEMA, null)
    } finally {
      isLoading.value = false
    }
  }

  async function loadFromUrl(url: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Kon URL niet ophalen (${response.status})`)
      const parsed = parseContent(await response.text())
      applySchema(parsed, url)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Kon URL niet ophalen'
      applySchema(EMPTY_SCHEMA, null)
    } finally {
      isLoading.value = false
    }
  }

  async function restoreFromExport(exported: ExportedSchema): Promise<void> {
    if (exported.sourceUrl) {
      await loadFromUrl(exported.sourceUrl)
      return
    }
    applySchema(buildSchemaFromFields(exported.name, exported.fields ?? []), null)
    error.value = null
  }

  /** Hydrate the persisted schema for the active workspace. */
  function load(): Promise<unknown> {
    return sourceSchemaResource.load()
  }

  return { schema, sourceUrl, error, isLoading, load, loadFromFile, loadFromUrl, restoreFromExport }
}
