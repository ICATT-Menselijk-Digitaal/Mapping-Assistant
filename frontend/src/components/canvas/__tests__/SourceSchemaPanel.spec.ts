import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SourceSchemaPanel from '../SourceSchemaPanel.vue'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'

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
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nodes) }, attachTo: div })

      await wrapper.vm.scrollToField('zaakId')

      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })

      wrapper.unmount()
      div.remove()
    })

    it('expands a collapsed group before scrolling to the field', async () => {
      window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock
      const div = document.createElement('div')
      document.body.appendChild(div)

      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(zaakNodes) }, attachTo: div })
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
      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(nodesWithChildren) }, attachTo: div })
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

      const wrapper = mount(SourceSchemaPanel, { props: { schema: schemaOf(zaakNodes) }, attachTo: div })

      await wrapper.vm.scrollToField('non-existent-id')

      expect(scrollIntoViewMock).not.toHaveBeenCalled()

      wrapper.unmount()
      div.remove()
    })
  })
})
