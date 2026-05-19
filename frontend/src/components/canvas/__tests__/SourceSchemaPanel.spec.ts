import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SourceSchemaPanel from '../SourceSchemaPanel.vue'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'

function node(overrides: Partial<SchemaFieldNode> & { name: string }): SchemaFieldNode {
  return {
    id: overrides.path ?? overrides.name,
    path: overrides.name,
    dataType: 'string',
    required: false,
    ...overrides,
  }
}

function schemaOf(nodes: SchemaFieldNode[]) {
  return buildSchema('', nodes)
}

const zaakNodes: SchemaFieldNode[] = [
  node({ name: 'zaakId', path: 'Zaak.zaakId', id: 'Zaak.zaakId', dataType: 'string', required: true }),
  node({ name: 'omschrijving', path: 'Zaak.omschrijving', id: 'Zaak.omschrijving', dataType: 'string' }),
]

const statusNodes: SchemaFieldNode[] = [
  node({ name: 'statusCode', path: 'Status.statusCode', id: 'Status.statusCode', dataType: 'string' }),
]

const multiSchemaNodes = [...zaakNodes, ...statusNodes]

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('SourceSchemaPanel', () => {
  // Scenario: Source fields visible after loading
  it('shows group headers for each schema object', () => {
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(multiSchemaNodes) } })
    expect(wrapper.text()).toContain('Zaak')
    expect(wrapper.text()).toContain('Status')
  })

  it('shows empty state instruction when no fields', () => {
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf([]) } })
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  // Scenario: Field metadata visible per field
  it('shows the data type for each field', () => {
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(zaakNodes) } })
    expect(wrapper.text()).toContain('str')
  })

  it('shows required badge for required fields', () => {
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(zaakNodes) } })
    expect(wrapper.find('[data-testid="req-badge"]').exists()).toBe(true)
  })

  // Scenario: Expand schema object
  it('renders schema group headers', () => {
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(multiSchemaNodes) } })
    expect(wrapper.find('[data-testid="schema-group-Zaak"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="schema-group-Status"]').exists()).toBe(true)
  })

  it('expands and collapses a schema group on header click', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(multiSchemaNodes) }, attachTo: div })
    expect(wrapper.find('[data-testid="schema-group-fields-Zaak"]').isVisible()).toBe(false)
    await wrapper.find('[data-testid="schema-group-toggle-Zaak"]').trigger('click')
    expect(wrapper.find('[data-testid="schema-group-fields-Zaak"]').isVisible()).toBe(true)
    await wrapper.find('[data-testid="schema-group-toggle-Zaak"]').trigger('click')
    expect(wrapper.find('[data-testid="schema-group-fields-Zaak"]').isVisible()).toBe(false)
    wrapper.unmount()
    div.remove()
  })

  // Scenario: Display nested $ref structure
  it('renders children of a field as an expandable subtree', async () => {
    const nodesWithChildren: SchemaFieldNode[] = [
      node({
        name: 'adres',
        path: 'adres',
        id: 'adres',
        dataType: 'object',
        children: [
          node({ name: 'straat', path: 'adres.straat', id: 'adres.straat', dataType: 'string' }),
        ],
      }),
    ]
    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nodesWithChildren) }, attachTo: div })
    expect(wrapper.text()).toContain('adres')
    expect(wrapper.find('[data-testid="field-children-adres"]').isVisible()).toBe(false)
    await wrapper.find('[data-testid="field-toggle-adres"]').trigger('click')
    expect(wrapper.find('[data-testid="field-children-adres"]').isVisible()).toBe(true)
    wrapper.unmount()
    div.remove()
  })

  // Scenario: Maximum field length visible for string fields
  it('shows maxLength next to string fields that define it', () => {
    const nodesWithMax: SchemaFieldNode[] = [
      node({ name: 'naam', path: 'naam', id: 'naam', dataType: 'string', maxLength: 255 }),
    ]
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nodesWithMax) } })
    expect(wrapper.text()).toContain('255')
  })
})

describe('Search and status filter', () => {
  function mountPanel(nodes: SchemaFieldNode[]) {
    return mount(SourceSchemaPanel, { props: { schema: schemaOf(nodes) } })
  }

  const flatNodes: SchemaFieldNode[] = [
    node({ name: 'cityName', path: 'cityName', id: 'cityName' }),
    node({ name: 'countryCode', path: 'countryCode', id: 'countryCode' }),
    node({ name: 'postalCode', path: 'postalCode', id: 'postalCode' }),
  ]

  const nestedNodes: SchemaFieldNode[] = [
    node({
      name: 'address',
      path: 'address',
      id: 'address',
      dataType: 'object',
      children: [
        node({ name: 'city', path: 'address.city', id: 'address.city' }),
        node({ name: 'street', path: 'address.street', id: 'address.street' }),
      ],
    }),
    node({ name: 'email', path: 'email', id: 'email' }),
  ]

  // Scenario: Administrator finds a field by name
  it('shows only fields matching the search query', async () => {
    const wrapper = mountPanel(flatNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('city')
    expect(wrapper.text()).toContain('cityName')
    expect(wrapper.text()).not.toContain('countryCode')
    expect(wrapper.text()).not.toContain('postalCode')
  })

  // Scenario: Nested child field is shown with its parent group as context
  it('shows matching child field under its parent, hides non-matching siblings', async () => {
    const wrapper = mountPanel(nestedNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('city')
    expect(wrapper.text()).toContain('address')
    expect(wrapper.text()).toContain('city')
    expect(wrapper.text()).not.toContain('street')
    expect(wrapper.text()).not.toContain('email')
  })

  // Scenario: Search returns no matching fields
  it('shows no-results empty state when search matches nothing', async () => {
    const wrapper = mountPanel(flatNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('zzznomatch')
    expect(wrapper.find('[data-testid="no-results"]').exists()).toBe(true)
  })

  // Scenario: Administrator filters the source panel by unmapped fields
  it('shows only unmapped fields when Unmapped filter is active', async () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'cityName', targetFieldId: 'tgt-x' })
    const wrapper = mountPanel(flatNodes)
    await wrapper.find('[data-testid="filter-unmapped"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('cityName')
    expect(wrapper.text()).toContain('countryCode')
    expect(wrapper.text()).toContain('postalCode')
  })

  // Scenario: Administrator filters the source panel by mapped fields
  it('shows only mapped fields when Mapped filter is active', async () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'cityName', targetFieldId: 'tgt-x' })
    const wrapper = mountPanel(flatNodes)
    await wrapper.find('[data-testid="filter-mapped"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('cityName')
    expect(wrapper.text()).not.toContain('countryCode')
    expect(wrapper.text()).not.toContain('postalCode')
  })

  // Option D: auto-expand — matching children visible without manual group expand
  it('shows matching child fields without requiring manual group expansion when filter is active', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nestedNodes) }, attachTo: div })
    // Children subtree is hidden by default (collapsed)
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(false)
    // Activate search filter
    await wrapper.find('[data-testid="search-input"]').setValue('city')
    // Children subtree is now visible without clicking the toggle
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(true)
    wrapper.unmount()
    div.remove()
  })

  // Scenario: Administrator combines name search with status filter
  it('shows only unmapped fields matching the search query when both filters are active', async () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'cityName', targetFieldId: 'tgt-x' })
    const wrapper = mountPanel(flatNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('Code')
    await wrapper.find('[data-testid="filter-unmapped"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('countryCode')
    expect(wrapper.text()).toContain('postalCode')
    expect(wrapper.text()).not.toContain('cityName')
  })
})
