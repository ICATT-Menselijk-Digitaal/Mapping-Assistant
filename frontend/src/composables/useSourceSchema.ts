import { ref } from 'vue'
import * as yaml from 'js-yaml'
import { EMPTY_SCHEMA, type Schema } from '@/domain/schema'
import { parseOpenApiSchema } from '@/utils/openApiParser'

export function useSourceSchema() {
  const schema = ref<Schema>(EMPTY_SCHEMA)
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  function parseContent(content: string): void {
    let spec: unknown
    try {
      spec = yaml.load(content)
    } catch {
      throw new Error('Ongeldig bestand: geen geldige YAML, JSON of OpenAPI-spec')
    }
    schema.value = parseOpenApiSchema(spec)
    error.value = null
  }

  async function loadFromFile(file: File): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const content = await file.text()
      parseContent(content)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Kon bestand niet verwerken'
      schema.value = EMPTY_SCHEMA
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
      const content = await response.text()
      parseContent(content)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Kon URL niet ophalen'
      schema.value = EMPTY_SCHEMA
    } finally {
      isLoading.value = false
    }
  }

  return { schema, error, isLoading, loadFromFile, loadFromUrl }
}
