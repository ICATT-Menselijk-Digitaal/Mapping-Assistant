import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SourceSchemaPanel from '../SourceSchemaPanel.vue'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useSuggestionScope } from '@/composables/useSuggestionScope'

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
  node({
    name: 'zaakId',
    path: 'Zaak.zaakId',
    id: 'Zaak.zaakId',
    dataType: 'string',
    required: true,
  }),
  node({
    name: 'omschrijving',
    path: 'Zaak.omschrijving',
    id: 'Zaak.omschrijving',
    dataType: 'string',
  }),
]

const statusNodes: SchemaFieldNode[] = [
  node({
    name: 'statusCode',
    path: 'Status.statusCode',
    id: 'Status.statusCode',
    dataType: 'string',
  }),
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
    const wrapper = mount(SourceSchemaPanel, {
      props: { schema: schemaOf(multiSchemaNodes) },
      attachTo: div,
    })
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
    const wrapper = mount(SourceSchemaPanel, {
      props: { schema: schemaOf(nodesWithChildren) },
      attachTo: div,
    })
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

  // Scenario: Selecting a coupling scrolls both field panels to the coupled fields
  describe('scrollToField', () => {
    const scrollIntoViewMock = vi.fn<() => void>()

    afterEach(() => {
      scrollIntoViewMock.mockReset()
    })

    it('calls scrollIntoView on the target field element', async () => {
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock
      const div = document.createElement('div')
      document.body.appendChild(div)

      const nodes = [node({ name: 'zaakId', path: 'zaakId', id: 'zaakId' })]
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(nodes) },
        attachTo: div,
      })

      await wrapper.vm.scrollToField('zaakId')

      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })

      wrapper.unmount()
      div.remove()
    })

    it('expands a collapsed group before scrolling to the field', async () => {
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock
      const div = document.createElement('div')
      document.body.appendChild(div)

      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(zaakNodes) },
        attachTo: div,
      })
      expect(wrapper.find('[data-testid="schema-group-fields-Zaak"]').isVisible()).toBe(false)

      await wrapper.vm.scrollToField('Zaak.zaakId')

      expect(wrapper.find('[data-testid="schema-group-fields-Zaak"]').isVisible()).toBe(true)
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })

      wrapper.unmount()
      div.remove()
    })

    it('expands a collapsed parent field before scrolling to a child field', async () => {
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock
      const div = document.createElement('div')
      document.body.appendChild(div)

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
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(nodesWithChildren) },
        attachTo: div,
      })
      expect(wrapper.find('[data-testid="field-children-adres"]').isVisible()).toBe(false)

      await wrapper.vm.scrollToField('adres.straat')

      expect(wrapper.find('[data-testid="field-children-adres"]').isVisible()).toBe(true)
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })

      wrapper.unmount()
      div.remove()
    })

    it('does nothing when the fieldId is not found in the schema', async () => {
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock
      const div = document.createElement('div')
      document.body.appendChild(div)

      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(zaakNodes) },
        attachTo: div,
      })

      await wrapper.vm.scrollToField('non-existent-id')

      expect(scrollIntoViewMock).not.toHaveBeenCalled()

      wrapper.unmount()
      div.remove()
    })
  })

  // Task #135: collapse-to-dot indicator for mapped fields inside a collapsed object
  describe('mapped-dot indicator', () => {
    const nestedMappedNodes: SchemaFieldNode[] = [
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

    // Scenario: Collapsing an object replaces its mapped fields' connection lines with a single dot
    it('shows a single dot next to a collapsed object that has a mapped field', () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'adres.straat', targetFieldId: 'tgt-x' })
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nestedMappedNodes) } })

      expect(wrapper.find('[data-testid="mapped-dot-adres"]').exists()).toBe(true)
    })

    it('shows no dot next to a collapsed object that has no mapped field', () => {
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nestedMappedNodes) } })
      expect(wrapper.find('[data-testid="mapped-dot-adres"]').exists()).toBe(false)
    })

    // Scenario: Expanding a collapsed object restores its mapped fields' connection lines
    it('hides the dot once the object is expanded', async () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'adres.straat', targetFieldId: 'tgt-x' })
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nestedMappedNodes) } })

      expect(wrapper.find('[data-testid="mapped-dot-adres"]').exists()).toBe(true)
      await wrapper.find('[data-testid="field-toggle-adres"]').trigger('click')
      expect(wrapper.find('[data-testid="mapped-dot-adres"]').exists()).toBe(false)
    })

    // Scenario: Collapsing a top-level object with deeply nested mapped fields shows exactly one dot
    it('shows exactly one dot for a top-level object with a mapped field several levels deep', () => {
      const deeplyNestedNodes: SchemaFieldNode[] = [
        node({
          name: 'adres',
          path: 'adres',
          id: 'adres',
          dataType: 'object',
          children: [
            node({
              name: 'contact',
              path: 'adres.contact',
              id: 'adres.contact',
              dataType: 'object',
              children: [
                node({
                  name: 'straat',
                  path: 'adres.contact.straat',
                  id: 'adres.contact.straat',
                  dataType: 'string',
                }),
              ],
            }),
          ],
        }),
      ]
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'adres.contact.straat', targetFieldId: 'tgt-x' })
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(deeplyNestedNodes) } })

      expect(wrapper.findAll('[data-testid^="mapped-dot-"]')).toHaveLength(1)
      expect(wrapper.find('[data-testid="mapped-dot-adres"]').exists()).toBe(true)
    })
  })

  // Task #135: field-hover highlighting
  describe('field hover', () => {
    const flatMappedNodes: SchemaFieldNode[] = [
      node({ name: 'cityName', path: 'cityName', id: 'cityName' }),
      node({ name: 'countryCode', path: 'countryCode', id: 'countryCode' }),
    ]

    // Scenario: Hovering a mapped field highlights its connection line and its mapped counterpart
    it('marks a field row highlighted when the store reports it as hovered', async () => {
      const store = useMappings()
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(flatMappedNodes) } })

      store.hoverField('cityName')
      await wrapper.vm.$nextTick()

      expect(
        wrapper.find('[data-field-id="cityName"]').attributes('data-highlighted'),
      ).toBe('true')
      expect(
        wrapper.find('[data-field-id="countryCode"]').attributes('data-highlighted'),
      ).toBe('false')
    })

    it("marks a field's mapped counterpart highlighted even though only the other field is hovered", async () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'cityName', targetFieldId: 'countryCode' })
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(flatMappedNodes) } })

      store.hoverField('cityName')
      await wrapper.vm.$nextTick()

      expect(
        wrapper.find('[data-field-id="countryCode"]').attributes('data-highlighted'),
      ).toBe('true')
    })

    // Scenario: Hovering an unmapped field shows no highlight
    it('highlights nothing when the hovered field has no mapping', async () => {
      const store = useMappings()
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(flatMappedNodes) } })

      store.hoverField('cityName')
      await wrapper.vm.$nextTick()

      expect(
        wrapper.find('[data-field-id="countryCode"]').attributes('data-highlighted'),
      ).toBe('false')
    })

    it('setting hoveredFieldId on mouseenter and clearing on mouseleave', async () => {
      const store = useMappings()
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(flatMappedNodes) } })

      await wrapper.find('[data-field-id="cityName"]').trigger('mouseenter')
      expect(store.hoveredFieldId).toBe('cityName')

      await wrapper.find('[data-field-id="cityName"]').trigger('mouseleave')
      expect(store.hoveredFieldId).toBeNull()
    })
  })

  // Task #129: source-side suggestion scope selection
  describe('suggestion scope selection', () => {
    afterEach(() => {
      localStorage.removeItem('ma_suggestion_scope_source_root_ids')
      localStorage.removeItem('ma_suggestion_scope_target_root_ids')
    })

    it('reflects group selection state in the scope checkbox', async () => {
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(multiSchemaNodes), side: 'source' },
      })
      const checkbox = () =>
        wrapper.find<HTMLInputElement>('[data-testid="scope-checkbox-source-Zaak"]')
      expect(checkbox().element.checked).toBe(false)
      await checkbox().trigger('change')
      expect(checkbox().element.checked).toBe(true)
    })

    it('toggling a group checkbox selects every root field in that group only', async () => {
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(multiSchemaNodes), side: 'source' },
      })
      const scopeStore = useSuggestionScope()
      await wrapper.find('[data-testid="scope-checkbox-source-Zaak"]').trigger('change')
      expect(scopeStore.isSelected('source', 'Zaak.zaakId')).toBe(true)
      expect(scopeStore.isSelected('source', 'Zaak.omschrijving')).toBe(true)
      expect(scopeStore.isSelected('source', 'Status.statusCode')).toBe(false)
    })

    it('toggling a fully-selected group checkbox again deselects every root field in that group', async () => {
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(multiSchemaNodes), side: 'source' },
      })
      const scopeStore = useSuggestionScope()
      await wrapper.find('[data-testid="scope-checkbox-source-Zaak"]').trigger('change')
      await wrapper.find('[data-testid="scope-checkbox-source-Zaak"]').trigger('change')
      expect(scopeStore.isSelected('source', 'Zaak.zaakId')).toBe(false)
      expect(scopeStore.isSelected('source', 'Zaak.omschrijving')).toBe(false)
    })

    // Scenario: Select all picks every source container
    it('select-all picks every root field across every group', async () => {
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(multiSchemaNodes), side: 'source' },
      })
      const scopeStore = useSuggestionScope()
      await wrapper.find('[data-testid="scope-select-all-source"]').trigger('click')
      expect(scopeStore.isSelected('source', 'Zaak.zaakId')).toBe(true)
      expect(scopeStore.isSelected('source', 'Zaak.omschrijving')).toBe(true)
      expect(scopeStore.isSelected('source', 'Status.statusCode')).toBe(true)
      expect(wrapper.find('[data-testid="scope-select-all-source"]').text()).toBe(
        'Deselecteer alles (bereik)',
      )
    })

    // Scenario: Deselect all clears the scope
    it('deselect-all clears every selected root field', async () => {
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(multiSchemaNodes), side: 'source' },
      })
      const scopeStore = useSuggestionScope()
      await wrapper.find('[data-testid="scope-select-all-source"]').trigger('click')
      await wrapper.find('[data-testid="scope-select-all-source"]').trigger('click')
      expect(scopeStore.isSelected('source', 'Zaak.zaakId')).toBe(false)
      expect(scopeStore.isSelected('source', 'Status.statusCode')).toBe(false)
      expect(wrapper.find('[data-testid="scope-select-all-source"]').text()).toBe(
        'Selecteer alles (bereik)',
      )
    })

    // Per Feature #89 AC: target side is never scope-gated, so no scope UI renders there
    it('does not render scope selection UI on the target side', () => {
      const wrapper = mount(SourceSchemaPanel, {
        props: { schema: schemaOf(multiSchemaNodes), side: 'target' },
      })
      expect(wrapper.find('[data-testid="scope-select-all-target"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="scope-checkbox-target-Zaak"]').exists()).toBe(false)
    })
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

  // Bug #138: Mapped filter must not show parent fields whose children are all unmapped
  it('hides parent field when none of its children are mapped and Mapped filter is active', async () => {
    // nestedNodes: address (parent with city/street), email (leaf) — nothing mapped
    const wrapper = mountPanel(nestedNodes)
    await wrapper.find('[data-testid="filter-mapped"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="no-results"]').exists()).toBe(true)
  })

  it('shows parent field when at least one child is mapped and Mapped filter is active', async () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'address.city', targetFieldId: 'tgt-x' })
    const wrapper = mountPanel(nestedNodes)
    await wrapper.find('[data-testid="filter-mapped"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="field-toggle-address"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('email')
  })

  // Option D: auto-expand — matching children visible without manual group expand
  it('shows matching child fields without requiring manual group expansion when filter is active', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(SourceSchemaPanel, {
      props: { schema: schemaOf(nestedNodes) },
      attachTo: div,
    })
    // Children subtree is hidden by default (collapsed)
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(false)
    // Activate search filter
    await wrapper.find('[data-testid="search-input"]').setValue('city')
    // Children subtree is now visible without clicking the toggle
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(true)
    wrapper.unmount()
    div.remove()
  })

  // Bug: parent field with matching children must remain manually collapsable while filter is active
  it('allows manual collapse of a parent field while Unmapped filter is active', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(SourceSchemaPanel, {
      props: { schema: schemaOf(nestedNodes) },
      attachTo: div,
    })
    await wrapper.find('[data-testid="filter-unmapped"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(true)
    await wrapper.find('[data-testid="field-toggle-address"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(false)
    wrapper.unmount()
    div.remove()
  })

  // Bug: unmapped parent whose name matches search must not appear under Mapped filter
  it('hides unmapped parent field when name matches search but no children are mapped and Mapped filter is active', async () => {
    // nestedNodes: address (parent) with city/street children — nothing mapped
    const wrapper = mountPanel(nestedNodes)
    await wrapper.find('[data-testid="filter-mapped"]').trigger('click')
    await wrapper.find('[data-testid="search-input"]').setValue('address')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="no-results"]').exists()).toBe(true)
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

describe('Search term highlighting', () => {
  function mountPanel(nodes: SchemaFieldNode[]) {
    return mount(SourceSchemaPanel, { props: { schema: schemaOf(nodes) } })
  }

  const directMatchNodes: SchemaFieldNode[] = [
    node({ name: 'customerAddress', path: 'customerAddress', id: 'customerAddress' }),
  ]

  const nestedNodes: SchemaFieldNode[] = [
    node({
      name: 'customer',
      path: 'customer',
      id: 'customer',
      dataType: 'object',
      children: [
        node({ name: 'street', path: 'customer.street', id: 'customer.street' }),
        node({ name: 'email', path: 'customer.email', id: 'customer.email' }),
      ],
    }),
  ]

  const parentMatchNodes: SchemaFieldNode[] = [
    node({
      name: 'address',
      path: 'address',
      id: 'address',
      dataType: 'object',
      children: [node({ name: 'zipCode', path: 'address.zipCode', id: 'address.zipCode' })],
    }),
  ]

  // Scenario: Matching substring is highlighted in a directly matching field name
  it('wraps the matching substring in a mark element for a leaf field', async () => {
    const wrapper = mountPanel(directMatchNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('address')
    const marks = wrapper.findAll('mark')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.some((m) => m.text().toLowerCase() === 'address')).toBe(true)
  })

  // Scenario: Child field name is highlighted when it directly matches the search query
  it('highlights the matching substring in a child field name', async () => {
    const wrapper = mountPanel(nestedNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('street')
    const marks = wrapper.findAll('mark')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.some((m) => m.text().toLowerCase() === 'street')).toBe(true)
  })

  // Scenario: Parent field is shown when its own name matches the search query
  it('shows a parent field when its own name matches, even if no children match', async () => {
    const wrapper = mountPanel(parentMatchNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('address')
    expect(wrapper.text()).toContain('address')
    const marks = wrapper.findAll('mark')
    expect(marks.some((m) => m.text().toLowerCase() === 'address')).toBe(true)
  })

  // Scenario: No highlight is shown when the search box is empty
  it('renders no mark elements when the search box is empty', () => {
    const wrapper = mountPanel(directMatchNodes)
    expect(wrapper.findAll('mark').length).toBe(0)
  })

  // Scenario: Highlight disappears when search is cleared
  it('removes mark elements when the search input is cleared', async () => {
    const wrapper = mountPanel(directMatchNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('address')
    expect(wrapper.findAll('mark').length).toBeGreaterThan(0)
    await wrapper.find('[data-testid="search-clear"]').trigger('click')
    expect(wrapper.findAll('mark').length).toBe(0)
  })

  // All children of a directly matching parent are shown and accessible
  it('shows all children of a directly matching parent field', async () => {
    const wrapper = mountPanel(parentMatchNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('address')
    expect(wrapper.text()).toContain('zipCode')
  })

  // Group name matches search query in multi-schema mode (top-level parent via group header)
  it('shows a named group and highlights its header when the group name matches the search query', async () => {
    const addressGroupNodes: SchemaFieldNode[] = [
      node({ name: 'street', path: 'Address.street', id: 'Address.street' }),
      node({ name: 'city', path: 'Address.city', id: 'Address.city' }),
    ]
    const wrapper = mountPanel(addressGroupNodes)
    await wrapper.find('[data-testid="search-input"]').setValue('address')
    expect(wrapper.text()).toContain('Address')
    expect(wrapper.text()).toContain('street')
    expect(wrapper.text()).toContain('city')
    const marks = wrapper.findAll('mark')
    expect(marks.some((m) => m.text().toLowerCase() === 'address')).toBe(true)
  })

  // Parent matched by name starts collapsed; user expands manually
  it('keeps children collapsed when parent matches by name but no children match, and expands on toggle click', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const wrapper = mount(SourceSchemaPanel, {
      props: { schema: schemaOf(parentMatchNodes) },
      attachTo: div,
    })
    await wrapper.find('[data-testid="search-input"]').setValue('address')
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(false)
    await wrapper.find('[data-testid="field-toggle-address"]').trigger('click')
    expect(wrapper.find('[data-testid="field-children-address"]').isVisible()).toBe(true)
    wrapper.unmount()
    div.remove()
  })
})
