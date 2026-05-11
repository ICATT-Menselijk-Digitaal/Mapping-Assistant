import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MappingOverview from '../MappingOverview.vue'
import { useMappings } from '@/composables/useMappings'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'

const sourceNodes: SchemaFieldNode[] = [
  { id: 'src-1', name: 'zaakId', path: 'zaakId', dataType: 'string', required: true },
  { id: 'src-2', name: 'omschrijving', path: 'omschrijving', dataType: 'string', required: false },
  { id: 'src-num', name: 'bedrag', path: 'bedrag', dataType: 'number', required: false },
  { id: 'src-long', name: 'beschrijving', path: 'beschrijving', dataType: 'string', maxLength: 200, required: false },
  { id: 'src-obj', name: 'adres', path: 'adres', dataType: 'object', required: false },
]

const targetNodes: SchemaFieldNode[] = [
  { id: 'tgt-1', name: 'uuid', path: 'uuid', dataType: 'string', required: true, maxLength: 36 },
  { id: 'tgt-2', name: 'startdatum', path: 'startdatum', dataType: 'date', required: false },
  { id: 'tgt-str', name: 'label', path: 'label', dataType: 'string', required: false },
  { id: 'tgt-short', name: 'code', path: 'code', dataType: 'string', maxLength: 10, required: false },
]

const sourceSchema = buildSchema('', sourceNodes)
const targetSchema = buildSchema('', targetNodes)

function mountOverview() {
  return mount(MappingOverview, {
    global: { plugins: [createPinia()] },
    props: { sourceSchema, targetSchema },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MappingOverview', () => {
  // Scenario: Mapping Overview empty without mappings
  it('shows an empty state when there are no active mappings', () => {
    const wrapper = mountOverview()
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(0)
  })

  // Scenario: Active mapping visible in Mapping Overview
  it('shows a row for each active mapping with field name and data type', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false)
    const row = wrapper.find('[data-testid="mapping-row"]')
    expect(row.text()).toContain('zaakId')
    expect(row.text()).toContain('str')
    expect(row.text()).toContain('startdatum')
    expect(row.text()).toContain('date')
  })

  // Scenario: Remove mapping via cross — confirmation dialog
  it('shows a confirmation dialog when × is clicked', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="delete-confirmation"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('zaakId')
    expect(wrapper.text()).toContain('startdatum')
  })

  it('removes the mapping row when confirmed', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="confirm-delete"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('emits FieldMappingRemoved when confirmed', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="confirm-delete"]').trigger('click')

    expect(wrapper.emitted('FieldMappingRemoved')).toBeTruthy()
    expect(wrapper.emitted('FieldMappingRemoved')![0]![0]).toMatchObject({
      sourceFieldId: 'src-1',
      targetFieldId: 'tgt-2',
    })
  })

  it('removes the mapping from the store when confirmed', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="confirm-delete"]').trigger('click')

    expect(store.mappings).toHaveLength(0)
  })

  it('keeps the mapping when cancelled', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.vm.$nextTick()

    const dialog = wrapper.find('[data-testid="delete-confirmation"]')
    await dialog.find('button').trigger('click') // Annuleren
    await wrapper.vm.$nextTick()

    expect(store.mappings).toHaveLength(1)
    expect(wrapper.find('[data-testid="delete-confirmation"]').exists()).toBe(false)
  })

  // Scenario: Compatible coupling shows a green checkmark
  it('shows a green checkmark for a compatible coupling', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-num', targetFieldId: 'tgt-str' }) // number → string = compatible
    await wrapper.vm.$nextTick()

    const icon = wrapper.find('[data-testid="validation-status"]')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('text-emerald-600')
  })

  // Scenario: Constrained coupling shows an orange exclamation mark
  it('shows an orange exclamation for a constrained coupling', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-long', targetFieldId: 'tgt-short' }) // string maxLength 200 → maxLength 10 = constrained
    await wrapper.vm.$nextTick()

    const icon = wrapper.find('[data-testid="validation-status"]')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('text-amber-600')
  })

  // Scenario: Incompatible coupling shows a red cross
  it('shows a red cross for an incompatible coupling', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-obj', targetFieldId: 'tgt-str' }) // object → string = incompatible
    await wrapper.vm.$nextTick()

    const icon = wrapper.find('[data-testid="validation-status"]')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('text-red-500')
  })

  // Scenario: Matching rows are shown when a query is entered
  it('shows only matching rows when a search query is entered', async () => {
    const searchNodes: SchemaFieldNode[] = [
      { id: 'n-voornaam', name: 'voornaam', path: 'voornaam', dataType: 'string', required: false },
      { id: 'n-achternaam', name: 'achternaam', path: 'achternaam', dataType: 'string', required: false },
      { id: 'n-postcode', name: 'postcode', path: 'postcode', dataType: 'string', required: false },
    ]
    const schema = buildSchema('', searchNodes)
    const wrapper = mount(MappingOverview, {
      global: { plugins: [createPinia()] },
      props: { sourceSchema: schema, targetSchema: schema },
    })
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'n-voornaam', targetFieldId: 'n-voornaam' })
    store.createMapping({ sourceFieldId: 'n-achternaam', targetFieldId: 'n-achternaam' })
    store.createMapping({ sourceFieldId: 'n-postcode', targetFieldId: 'n-postcode' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="search-input"]').setValue('naam')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(2)
  })

  // Scenario: Search is case-insensitive
  it('filters case-insensitively', async () => {
    const caseNodes: SchemaFieldNode[] = [
      { id: 'n-postcode', name: 'Postcode', path: 'Postcode', dataType: 'string', required: false },
    ]
    const schema = buildSchema('', caseNodes)
    const wrapper = mount(MappingOverview, {
      global: { plugins: [createPinia()] },
      props: { sourceSchema: schema, targetSchema: schema },
    })
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'n-postcode', targetFieldId: 'n-postcode' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="search-input"]').setValue('postcode')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(1)
  })

  // Scenario: No matching rows shows an empty state
  it('shows a no-results message when no rows match the query', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="search-input"]').setValue('xyz')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="no-results"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="no-results"]').text()).toContain('xyz')
    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(0)
  })

  // Scenario: Clearing the search restores all rows
  it('restores all rows when the search is cleared', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-1' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="search-input"]').setValue('zaakId')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(1)

    await wrapper.find('[data-testid="search-input"]').setValue('')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(2)
  })

  // Scenario: Filter matches on target field name
  it('matches on target field name', async () => {
    const filterNodes: SchemaFieldNode[] = [
      { id: 'n-id', name: 'id', path: 'id', dataType: 'string', required: false },
      { id: 'n-gemeente', name: 'gemeente_code', path: 'gemeente_code', dataType: 'string', required: false },
    ]
    const schema = buildSchema('', filterNodes)
    const wrapper = mount(MappingOverview, {
      global: { plugins: [createPinia()] },
      props: { sourceSchema: schema, targetSchema: schema },
    })
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'n-id', targetFieldId: 'n-gemeente' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="search-input"]').setValue('gemeente')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="mapping-row"]')).toHaveLength(1)
  })

  // Scenario: Status icons update when a mapping is removed
  it('removes the status icon when a mapping is removed', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-num', targetFieldId: 'tgt-str' }) // compatible
    store.createMapping({ sourceFieldId: 'src-obj', targetFieldId: 'tgt-str' }) // incompatible
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="validation-status"]')).toHaveLength(2)

    const incompatibleRow = wrapper.findAll('[data-testid="mapping-row"]').find((r) =>
      r.find('[data-testid="validation-status"]').classes().includes('text-red-500'),
    )!
    await incompatibleRow.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="confirm-delete"]').trigger('click')
    await wrapper.vm.$nextTick()

    const icons = wrapper.findAll('[data-testid="validation-status"]')
    expect(icons).toHaveLength(1)
    expect(icons[0]!.classes()).toContain('text-emerald-600')
  })
})
