import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ExportButton from '../ExportButton.vue'
import { useMappings } from '@/composables/useMappings'
import { EMPTY_SCHEMA } from '@/domain/schema'
import type { Schema, SchemaField } from '@/domain/schema'

vi.mock('@/utils/downloadHelper', () => ({ downloadAsJson: vi.fn<() => void>() }))

import { downloadAsJson } from '@/utils/downloadHelper'
const mockDownload = vi.mocked(downloadAsJson)

function makeSchema(name: string, fields: SchemaField[]): Schema {
  return {
    name,
    roots: fields,
    byId: (id) => fields.find((f) => f.id === id),
    has: (id) => fields.some((f) => f.id === id),
    all: () => fields,
    childrenOf: () => [],
    parentOf: () => undefined,
    pathOf: () => [],
  }
}

const sourceField: SchemaField = {
  id: 'src-1',
  name: 'zaakId',
  path: 'zaak.zaakId',
  dataType: 'string',
  required: true,
}
const targetField: SchemaField = {
  id: 'tgt-1',
  name: 'identificatie',
  path: 'zaak.identificatie',
  dataType: 'string',
  required: true,
}

const loadedSource = makeSchema('Bron', [sourceField])
const loadedTarget = makeSchema('Doel', [targetField])

beforeEach(() => {
  setActivePinia(createPinia())
  mockDownload.mockReset()
})

const defaultProps = {
  sourceSchema: loadedSource,
  targetSchema: loadedTarget,
  sourceUrl: null,
  targetUrl: null,
}

describe('ExportButton', () => {
  // Edge case: schemas not loaded
  it('is disabled when source schema is empty', () => {
    const wrapper = mount(ExportButton, { props: { ...defaultProps, sourceSchema: EMPTY_SCHEMA } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('is disabled when target schema is empty', () => {
    const wrapper = mount(ExportButton, { props: { ...defaultProps, targetSchema: EMPTY_SCHEMA } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('is disabled when both schemas are empty', () => {
    const wrapper = mount(ExportButton, {
      props: { ...defaultProps, sourceSchema: EMPTY_SCHEMA, targetSchema: EMPTY_SCHEMA },
    })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  // Scenario: Administrator downloads the mapping set as JSON file
  it('is enabled when both schemas are loaded', () => {
    const wrapper = mount(ExportButton, { props: defaultProps })
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('calls downloadAsJson with all field mappings when clicked', async () => {
    const mappingsStore = useMappings()
    mappingsStore.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    const wrapper = mount(ExportButton, { props: defaultProps })
    await wrapper.find('button').trigger('click')

    expect(mockDownload).toHaveBeenCalledOnce()
    const [payload, filename] = mockDownload.mock.calls[0]! as [
      { fieldMappings: unknown[] },
      string,
    ]
    expect(payload.fieldMappings).toHaveLength(1)
    expect(filename).toMatch(/^koppelingsset-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('includes source schema and target schema in the download payload', async () => {
    const wrapper = mount(ExportButton, { props: defaultProps })
    await wrapper.find('button').trigger('click')

    const [payload] = mockDownload.mock.calls[0]! as [
      { sourceSchema: { name: string }; targetSchema: { name: string } },
      string,
    ]
    expect(payload.sourceSchema.name).toBe('Bron')
    expect(payload.targetSchema.name).toBe('Doel')
  })

  it('passes the schema source URLs through to the payload', async () => {
    const wrapper = mount(ExportButton, {
      props: {
        ...defaultProps,
        sourceUrl: 'https://example.com/src.json',
        targetUrl: 'https://example.com/tgt.json',
      },
    })
    await wrapper.find('button').trigger('click')

    const [payload] = mockDownload.mock.calls[0]! as [
      { sourceSchema: { sourceUrl: string | null }; targetSchema: { sourceUrl: string | null } },
      string,
    ]
    expect(payload.sourceSchema.sourceUrl).toBe('https://example.com/src.json')
    expect(payload.targetSchema.sourceUrl).toBe('https://example.com/tgt.json')
  })

  // Scenario: Export button available without mappings
  it('calls downloadAsJson with empty fieldMappings when no mappings defined', async () => {
    const wrapper = mount(ExportButton, { props: defaultProps })
    await wrapper.find('button').trigger('click')

    expect(mockDownload).toHaveBeenCalledOnce()
    const [payload] = mockDownload.mock.calls[0]! as [{ fieldMappings: unknown[] }, string]
    expect(payload.fieldMappings).toHaveLength(0)
  })
})
