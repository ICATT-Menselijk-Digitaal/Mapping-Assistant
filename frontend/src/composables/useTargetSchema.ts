import { computed, ref } from 'vue'
import * as yaml from 'js-yaml'
import { EMPTY_SCHEMA, type Schema } from '@/domain/schema'
import { parseOpenApiSchema } from '@/utils/openApiParser'
import { buildSchemaFromFields } from '@/utils/schemaFromFields'
import type { ExportedSchema } from '@/utils/exportSerializer'
import { targetSchemaResource } from '@/api/resources'

/**
 * Target-schema state. Mirror of useSourceSchema, backed by the target-schema
 * resource: `schema`/`sourceUrl` are reactive projections of the cache + remote
 * backend; parsing and transient error/loading flags stay local.
 */
export function useTargetSchema() {
  const schema = computed<Schema>(() => targetSchemaResource.state.value.schema)
  const sourceUrl = computed<string | null>(() => targetSchemaResource.state.value.sourceUrl)
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  function applySchema(nextSchema: Schema, nextSourceUrl: string | null): void {
    targetSchemaResource.write({ schema: nextSchema, sourceUrl: nextSourceUrl })
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
    return targetSchemaResource.load()
  }

  return { schema, sourceUrl, error, isLoading, load, loadFromFile, loadFromUrl, restoreFromExport }
}
