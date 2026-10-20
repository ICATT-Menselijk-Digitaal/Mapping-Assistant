import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setActivePinia, createPinia } from 'pinia'
import { useImport } from '@/composables/useImport'
import { useMappings } from '@/composables/useMappings'
import { useSchemaSide } from '@/composables/useSchemaSide'
import type { Schema } from '@/domain/schema'

// The large coupling sets in frontend/test-data/perf/ are the reference data
// for hover performance (Feature #195). They must import through the normal
// Import path without any network access — the schemas travel inline.
const DATASET_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-data/perf')

function datasetFile(name: string): File {
  const text = readFileSync(resolve(DATASET_DIR, name), 'utf8')
  return new File([text], name, { type: 'application/json' })
}

function leafCount(schema: Schema): number {
  return schema.all().filter((f) => schema.childrenOf(f.id).length === 0).length
}

describe('performance test datasets', () => {
  const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error('offline')))

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchSpy.mockClear()
  })

  // Scenario: The large test coupling sets can be imported without a network connection
  it('imports the generated coupling set offline with at least 200 fields per side', async () => {
    const source = useSchemaSide('source')
    const target = useSchemaSide('target')
    const { importMappingSet, error } = useImport()

    const payload = await importMappingSet(
      datasetFile('generated.koppelingsset.json'),
      source,
      target,
    )

    expect(error.value).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(leafCount(source.schema.value)).toBeGreaterThanOrEqual(200)
    expect(leafCount(target.schema.value)).toBeGreaterThanOrEqual(200)
    expect(useMappings().mappings).toHaveLength(payload!.fieldMappings.length)
    expect(payload!.fieldMappings.length).toBeGreaterThanOrEqual(200)
  })

  // Edge case: a field with many connections
  it('contains a source field coupled to many target fields', async () => {
    const source = useSchemaSide('source')
    const target = useSchemaSide('target')
    await useImport().importMappingSet(datasetFile('generated.koppelingsset.json'), source, target)

    const perSource = new Map<string, number>()
    for (const m of useMappings().mappings) {
      if (m.sourceFieldId) perSource.set(m.sourceFieldId, (perSource.get(m.sourceFieldId) ?? 0) + 1)
    }
    expect(Math.max(...perSource.values())).toBeGreaterThanOrEqual(50)
  })

  // Scenario: The large test coupling sets can be imported without a network connection
  it('imports the real DET → OpenZaak coupling set offline with its couplings', async () => {
    const source = useSchemaSide('source')
    const target = useSchemaSide('target')
    const { importMappingSet, error } = useImport()

    const payload = await importMappingSet(
      datasetFile('det-openzaak.koppelingsset.json'),
      source,
      target,
    )

    expect(error.value).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(source.schema.value.name).toBe('e-Suite Data Extractie Tool (DET)')
    expect(target.schema.value.name).toBe('Zaken API')
    expect(leafCount(source.schema.value)).toBeGreaterThanOrEqual(200)
    expect(leafCount(target.schema.value)).toBeGreaterThanOrEqual(200)
    expect(useMappings().mappings).toHaveLength(payload!.fieldMappings.length)
    expect(payload!.fieldMappings.length).toBeGreaterThanOrEqual(200)
  })
})
