import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MappingCanvas from '../MappingCanvas.vue'
import { useMappings } from '@/composables/useMappings'
import { buildSchema, EMPTY_SCHEMA, type SchemaFieldNode, type ParsedEndpoint } from '@/domain/schema'

const sourceNodes: SchemaFieldNode[] = [
  { id: 'src-1', name: 'zaakId', path: 'zaakId', dataType: 'string', required: true },
  { id: 'src-2', name: 'omschrijving', path: 'omschrijving', dataType: 'string', required: false },
]

const targetNodes: SchemaFieldNode[] = [
  { id: 'tgt-1', name: 'uuid', path: 'uuid', dataType: 'string', required: true },
  { id: 'tgt-2', name: 'titel', path: 'titel', dataType: 'string', required: false },
]

const sourceSchema = buildSchema('', sourceNodes)
const targetSchema = buildSchema('', targetNodes)

function mountCanvas() {
  return mount(MappingCanvas, {
    global: { plugins: [createPinia()] },
    props: { sourceSchema, targetSchema },
  })
}

const coverageSourceNodes: SchemaFieldNode[] = Array.from({ length: 15 }, (_, i) => ({
  id: `src-${i + 1}`,
  name: `srcField${i + 1}`,
  path: `srcField${i + 1}`,
  dataType: 'string' as const,
  required: false,
}))

const coverageTargetNodes: SchemaFieldNode[] = Array.from({ length: 8 }, (_, i) => ({
  id: `tgt-${i + 1}`,
  name: `tgtField${i + 1}`,
  path: `tgtField${i + 1}`,
  dataType: 'string' as const,
  required: i < 5,
}))

const coverageSourceSchema = buildSchema('', coverageSourceNodes)
const coverageTargetSchema = buildSchema('', coverageTargetNodes)

function mountCoverageCanvas() {
  return mount(MappingCanvas, {
    global: { plugins: [createPinia()] },
    props: {
      sourceSchema: coverageSourceSchema,
      targetSchema: coverageTargetSchema,
      sourceLabel: 'Bron',
      targetLabel: 'Doel',
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MappingCanvas', () => {
  // Scenario: Upload UI visible when no source schema loaded
  it('shows source upload area when no schemas are loaded', () => {
    const wrapper = mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: { sourceSchema: EMPTY_SCHEMA, targetSchema: EMPTY_SCHEMA },
    })
    expect(wrapper.find('[data-testid="source-upload"]').exists()).toBe(true)
  })

  it('hides source upload area when source fields are present', () => {
    const wrapper = mountCanvas()
    expect(wrapper.find('[data-testid="source-upload"]').exists()).toBe(false)
  })

  // Scenario: Source field nodes visible after loading source schema
  it('shows all source fields in the source panel', () => {
    const wrapper = mountCanvas()
    const sourceColumn = wrapper.find('[data-testid="source-column"]')
    expect(sourceColumn.text()).toContain('zaakId')
    expect(sourceColumn.text()).toContain('omschrijving')
  })

  // Scenario: Target field nodes visible after loading target schema
  it('shows all target fields in the target panel', () => {
    const wrapper = mountCanvas()
    const targetColumn = wrapper.find('[data-testid="target-column"]')
    expect(targetColumn.text()).toContain('uuid')
  })

  // Scenario: Select source field and map to target field
  it('emits FieldMappingCreated after source then target field are clicked', async () => {
    const wrapper = mountCanvas()
    await wrapper.find('[data-field-id="src-1"]').trigger('click')
    await wrapper.find('[data-field-id="tgt-1"]').trigger('click')

    expect(wrapper.emitted('FieldMappingCreated')).toBeTruthy()
    expect(wrapper.emitted('FieldMappingCreated')![0]![0]).toMatchObject({
      sourceFieldId: 'src-1',
      targetFieldId: 'tgt-1',
    })
  })

  it('clicking only a source field does not emit FieldMappingCreated', async () => {
    const wrapper = mountCanvas()
    await wrapper.find('[data-field-id="src-1"]').trigger('click')

    expect(wrapper.emitted('FieldMappingCreated')).toBeFalsy()
  })

  it('clicking target with no source selected does nothing', async () => {
    const wrapper = mountCanvas()
    const store = useMappings()

    await wrapper.find('[data-field-id="tgt-1"]').trigger('click')

    expect(store.mappings).toHaveLength(0)
    expect(wrapper.emitted('FieldMappingCreated')).toBeFalsy()
  })

  // Many-to-many: same source to multiple targets
  it('allows the same source field to be mapped to multiple target fields', async () => {
    const wrapper = mountCanvas()
    const store = useMappings()

    await wrapper.find('[data-field-id="src-1"]').trigger('click')
    await wrapper.find('[data-field-id="tgt-1"]').trigger('click')

    await wrapper.find('[data-field-id="src-1"]').trigger('click')
    await wrapper.find('[data-field-id="tgt-2"]').trigger('click')

    expect(store.mappings).toHaveLength(2)
    expect(wrapper.emitted('FieldMappingCreated')).toHaveLength(2)
  })

  // Exact duplicate pair is silently ignored
  it('does not create a duplicate mapping for the same source-target pair', async () => {
    const wrapper = mountCanvas()
    const store = useMappings()

    await wrapper.find('[data-field-id="src-1"]').trigger('click')
    await wrapper.find('[data-field-id="tgt-1"]').trigger('click')

    await wrapper.find('[data-field-id="src-1"]').trigger('click')
    await wrapper.find('[data-field-id="tgt-1"]').trigger('click')

    expect(store.mappings).toHaveLength(1)
  })

})

describe('Coverage rate counters', () => {
  // Scenario: Required target fields counter visible after loading schemas
  it('shows "0 van 8 doelvelden gekoppeld" when no mappings exist', () => {
    const wrapper = mountCoverageCanvas()
    expect(wrapper.text()).toContain('0 van 8 doelvelden gekoppeld')
  })

  // Scenario: Source fields counter visible after loading schemas
  it('shows "0 van 15 bronvelden gekoppeld" when no mappings exist', () => {
    const wrapper = mountCoverageCanvas()
    expect(wrapper.text()).toContain('0 van 15 bronvelden gekoppeld')
  })

  // Scenario: Counters updated after mapping a required target field
  it('updates counters to 1 after mapping a source field to a required target field', async () => {
    const wrapper = mountCoverageCanvas()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('1 van 8 doelvelden gekoppeld')
    expect(wrapper.text()).toContain('1 van 15 bronvelden gekoppeld')
  })

  // Scenario: Counters updated after removal
  it('resets required target counter to 0 after removing the mapping', async () => {
    const wrapper = mountCoverageCanvas()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!
    await wrapper.vm.$nextTick()

    store.removeMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('0 van 8 doelvelden gekoppeld')
  })
})

describe('Endpoint selection', () => {
  const endpointNodes: SchemaFieldNode[] = [
    { id: 'ep-id', name: 'id', path: 'id', dataType: 'string', required: true },
  ]
  const endpointSchema = buildSchema('', endpointNodes)

  function makeEndpoint(path: string, method: ParsedEndpoint['method']): ParsedEndpoint {
    return { path, method, schema: endpointSchema }
  }

  const getEndpoint = makeEndpoint('/zaken', 'get')
  const postEndpoint = makeEndpoint('/zaken', 'post')
  const putEndpoint = makeEndpoint('/zaken/{id}', 'put')

  // Scenario: Target panel lists POST and PUT endpoints separately
  it('shows endpoint picker in source column when sourceEndpoints provided', () => {
    const wrapper = mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: { sourceSchema: EMPTY_SCHEMA, targetSchema: EMPTY_SCHEMA, sourceEndpoints: [getEndpoint] },
    })
    expect(wrapper.find('[data-testid="source-column"] [data-testid="endpoint-picker"]').exists()).toBe(true)
  })

  it('shows both POST and PUT endpoints in target picker', () => {
    const wrapper = mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: {
        sourceSchema: EMPTY_SCHEMA,
        targetSchema: EMPTY_SCHEMA,
        targetEndpoints: [postEndpoint, putEndpoint],
      },
    })
    const picker = wrapper.find('[data-testid="target-column"] [data-testid="endpoint-picker"]')
    expect(picker.exists()).toBe(true)
    const options = picker.findAll('option')
    expect(options.some((o) => o.text() === 'POST /zaken')).toBe(true)
    expect(options.some((o) => o.text() === 'PUT /zaken/{id}')).toBe(true)
  })

  // Scenario: Selecting a source endpoint populates the source panel with its fields
  it('shows fields from selected source endpoint after endpoint-select', async () => {
    const wrapper = mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: {
        sourceSchema: EMPTY_SCHEMA,
        targetSchema: EMPTY_SCHEMA,
        sourceEndpoints: [getEndpoint],
      },
    })
    const picker = wrapper.find('[data-testid="source-column"] [data-testid="endpoint-picker"]')
    await picker.setValue('/zaken::get')
    expect(wrapper.find('[data-testid="source-column"]').text()).toContain('id')
  })

  // Scenario: Selecting a target endpoint populates the target panel with its fields
  it('shows fields from selected target endpoint after endpoint-select', async () => {
    const wrapper = mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: {
        sourceSchema: EMPTY_SCHEMA,
        targetSchema: EMPTY_SCHEMA,
        targetEndpoints: [postEndpoint],
      },
    })
    const picker = wrapper.find('[data-testid="target-column"] [data-testid="endpoint-picker"]')
    await picker.setValue('/zaken::post')
    expect(wrapper.find('[data-testid="target-column"]').text()).toContain('id')
  })

  it('emits SourceEndpointChanged when source endpoint is selected', async () => {
    const wrapper = mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: {
        sourceSchema: EMPTY_SCHEMA,
        targetSchema: EMPTY_SCHEMA,
        sourceEndpoints: [getEndpoint],
      },
    })
    await wrapper.find('[data-testid="source-column"] [data-testid="endpoint-picker"]').setValue('/zaken::get')
    expect(wrapper.emitted('SourceEndpointChanged')).toBeTruthy()
    expect(wrapper.emitted('SourceEndpointChanged')![0]).toEqual([getEndpoint])
  })

  it('emits TargetEndpointChanged when target endpoint is selected', async () => {
    const wrapper = mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: {
        sourceSchema: EMPTY_SCHEMA,
        targetSchema: EMPTY_SCHEMA,
        targetEndpoints: [postEndpoint],
      },
    })
    await wrapper.find('[data-testid="target-column"] [data-testid="endpoint-picker"]').setValue('/zaken::post')
    expect(wrapper.emitted('TargetEndpointChanged')).toBeTruthy()
    expect(wrapper.emitted('TargetEndpointChanged')![0]).toEqual([postEndpoint])
  })
})

describe('Source schema upload UI', () => {
  function mountNoSource() {
    return mount(MappingCanvas, {
      global: { plugins: [createPinia()] },
      props: { sourceSchema: EMPTY_SCHEMA, targetSchema },
    })
  }

  // Scenario: Upload UI visible when no source schema loaded
  it('shows source upload area when source schema is empty', () => {
    const wrapper = mountNoSource()
    expect(wrapper.find('[data-testid="source-upload"]').exists()).toBe(true)
  })

  it('hides source upload area when source schema has fields', () => {
    const wrapper = mountCanvas()
    expect(wrapper.find('[data-testid="source-upload"]').exists()).toBe(false)
  })

  it('emits SourceFileSelected when a file is chosen', async () => {
    const wrapper = mountNoSource()
    const input = wrapper.find('[data-testid="source-file-input"]')
    const file = new File(['{}'], 'spec.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    expect(wrapper.emitted('SourceFileSelected')).toBeTruthy()
    expect(wrapper.emitted('SourceFileSelected')![0]![0]).toBe(file)
  })

  it('emits SourceUrlEntered when a URL is submitted', async () => {
    const wrapper = mountNoSource()
    await wrapper.find('[data-testid="source-url-input"]').setValue('https://example.com/api.json')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('SourceUrlEntered')).toBeTruthy()
    expect(wrapper.emitted('SourceUrlEntered')![0]![0]).toBe('https://example.com/api.json')
  })
})
