import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MappingOverview from '../MappingOverview.vue'
import { useMappings } from '@/composables/useMappings'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'

const sourceNodes: SchemaFieldNode[] = [
  { id: 'src-1', name: 'zaakId', path: 'zaakId', dataType: 'string', required: true },
  { id: 'src-2', name: 'omschrijving', path: 'omschrijving', dataType: 'string', required: false },
]

const targetNodes: SchemaFieldNode[] = [
  { id: 'tgt-1', name: 'uuid', path: 'uuid', dataType: 'string', required: true, maxLength: 36 },
  { id: 'tgt-2', name: 'startdatum', path: 'startdatum', dataType: 'date', required: false },
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
})
