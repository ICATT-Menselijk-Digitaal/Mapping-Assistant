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
  it('shows an orange exclamation for a constrained coupling with incomplete rules', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-long', targetFieldId: 'tgt-short' }) // string maxLength 200 → maxLength 10 = constrained
    await wrapper.vm.$nextTick()

    const icon = wrapper.find('[data-testid="validation-status"]')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('text-amber-600')
  })

  // Scenario: Constrained coupling with all mismatches resolved shows a checkmark
  it('shows a green checkmark for a constrained coupling once all mismatches are resolved', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-long', targetFieldId: 'tgt-short' })!
    await wrapper.vm.$nextTick()

    const icon = wrapper.find('[data-testid="validation-status"]')
    expect(icon.classes()).toContain('text-amber-600')

    store.addTransformationRule(mapping.id, {
      expression: '$length($) > 10 ? $substring($, 0, 7) & "..." : $',
      label: 'Afkappen',
      source: 'mismatch-solution',
      resolvesMismatch: 'truncate',
    })
    await wrapper.vm.$nextTick()

    expect(icon.classes()).toContain('text-emerald-600')
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

  // Scenario: Clicking a Mappingsoverzicht row highlights the corresponding canvas line (selection state)
  it('sets selectedMappingId in the store when a row is clicked', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="mapping-row"]').trigger('click')

    expect(store.selectedMappingId).toBe(store.mappings[0]!.id)
  })

  it('applies selected style (bg-indigo-50) to the selected row', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-1' })
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('[data-testid="mapping-row"]')
    await rows[0]!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(rows[0]!.classes()).toContain('bg-indigo-50')
    expect(rows[1]!.classes()).not.toContain('bg-indigo-50')
  })

  // Scenario: Removing a selected coupling clears the selection
  it('clears selectedMappingId when the selected mapping is removed', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()

    store.selectMapping(store.mappings[0]!.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="confirm-delete"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(store.selectedMappingId).toBeNull()
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

  // Scenario: Orphaned mappings after import — warning indicator visible
  it('shows a warning indicator for orphaned mappings', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.restoreMappings(
      [
        { sourceField: 'src-1', targetField: 'tgt-1', transformations: [] },
        { sourceField: 'missing-src', targetField: 'tgt-1', transformations: [] },
      ],
      sourceSchema,
      targetSchema,
    )
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('[data-testid="mapping-row"]')
    expect(rows).toHaveLength(2)

    const orphanIndicators = wrapper.findAll('[data-testid="orphan-indicator"]')
    expect(orphanIndicators).toHaveLength(1)
    expect(orphanIndicators[0]!.attributes('title')).toMatch(/orphan|niet-bestaand|verweesd/i)
  })

  it('does not select an orphaned mapping when its row is clicked', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.restoreMappings(
      [{ sourceField: 'missing-src', targetField: 'tgt-1', transformations: [] }],
      sourceSchema,
      targetSchema,
    )
    await wrapper.vm.$nextTick()

    const row = wrapper.find('[data-testid="mapping-row"]')
    await row.trigger('click')
    expect(store.selectedMappingId).toBeNull()
  })

  it('still lets the administrator remove an orphaned mapping', async () => {
    const wrapper = mountOverview()
    const store = useMappings()
    store.restoreMappings(
      [{ sourceField: 'missing-src', targetField: 'tgt-1', transformations: [] }],
      sourceSchema,
      targetSchema,
    )
    await wrapper.vm.$nextTick()

    const row = wrapper.find('[data-testid="mapping-row"]')
    await row.find('[data-testid="remove-mapping"]').trigger('click')
    await wrapper.find('[data-testid="confirm-delete"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(store.mappings).toHaveLength(0)
  })
})
