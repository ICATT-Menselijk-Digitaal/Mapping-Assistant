import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useMappings } from '@/composables/useMappings'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import CouplingDetailPanel from '../CouplingDetailPanel.vue'
import TruncationDialog from '../TruncationDialog.vue'

vi.mock('@/composables/useTransformationSuggestions', () => ({
  useTransformationSuggestions: () => ({
    generateSuggestion: vi.fn().mockResolvedValue(undefined),
    loadingMappingIds: new Set<string>(),
    generatedSuggestions: {},
  }),
}))

const srcNodes: SchemaFieldNode[] = [
  { id: 'src-str-long', name: 'bronveld', path: 'bronveld', dataType: 'string', maxLength: 200, required: false },
  { id: 'src-compatible', name: 'naam', path: 'naam', dataType: 'string', required: false },
  { id: 'src-incompatible', name: 'adres', path: 'adres', dataType: 'object', required: false },
  { id: 'src-num', name: 'bedrag', path: 'bedrag', dataType: 'number', required: false },
]
const tgtNodes: SchemaFieldNode[] = [
  { id: 'tgt-str-short', name: 'doelveld', path: 'doelveld', dataType: 'string', maxLength: 50, required: false },
  { id: 'tgt-compatible', name: 'label', path: 'label', dataType: 'string', required: false },
  { id: 'tgt-incompatible', name: 'omschrijving', path: 'omschrijving', dataType: 'string', required: false },
  { id: 'tgt-num', name: 'nummer', path: 'nummer', dataType: 'number', required: false },
]
const sourceSchema = buildSchema('bron', srcNodes)
const targetSchema = buildSchema('doel', tgtNodes)

function mountPanel(srcId = 'src-str-long', tgtId = 'tgt-str-short') {
  const store = useMappings()
  const mapping = store.createMapping({ sourceFieldId: srcId, targetFieldId: tgtId })!
  store.selectMapping(mapping.id)
  const wrapper = mount(CouplingDetailPanel, {
    props: { sourceSchema, targetSchema },
  })
  return { wrapper, store, mapping }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('CouplingDetailPanel — basics', () => {
  it('shows source and target field names when a mapping is selected', async () => {
    const { wrapper } = mountPanel()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="detail-source-field"]').text()).toContain('bronveld')
    expect(wrapper.find('[data-testid="detail-target-field"]').text()).toContain('doelveld')
  })

  it('shows compatible validation status for a compatible mapping', async () => {
    const { wrapper } = mountPanel('src-compatible', 'tgt-compatible')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="detail-validation-section"]').text()).toContain('compatibel')
  })

  it('shows incompatibility reason and remap note for an incompatible mapping', async () => {
    const { wrapper } = mountPanel('src-incompatible', 'tgt-incompatible')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="detail-validation-section"]').text()).toMatch(/object|string/i)
    expect(wrapper.find('[data-testid="remap-note"]').exists()).toBe(true)
  })

  it('clears the selected mapping when the close button is clicked', async () => {
    const { wrapper, store } = mountPanel()
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="detail-close"]').trigger('click')
    expect(store.selectedMappingId).toBeNull()
  })

  it('does not render the panel when no mapping is selected', () => {
    const store = useMappings()
    const wrapper = mount(CouplingDetailPanel, { props: { sourceSchema, targetSchema } })
    expect(wrapper.find('[data-testid="coupling-detail-panel"]').exists()).toBe(false)
    expect(store.selectedMappingId).toBeNull()
  })
})

describe('CouplingDetailPanel — mismatch detection', () => {
  // Scenario: Detected mismatches are listed when the panel opens
  it('shows a mismatch card for detected truncation mismatch', async () => {
    const { wrapper } = mountPanel()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mismatch-card-truncate"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Maximale lengte overschreden')
    expect(wrapper.find('[data-testid="mismatch-status-truncate"]').text()).toBe('● Vereist')
  })

  // Scenario: Clicking Oplossen on a mismatch card opens the correct dialog
  it('opens TruncationDialog when Oplossen is clicked on the truncation mismatch card', async () => {
    const { wrapper } = mountPanel()
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="mismatch-solve-truncate"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(TruncationDialog).exists()).toBe(true)
  })

  // Scenario: A resolved mismatch shows confirmed status
  it('shows resolved status when a truncation rule exists', async () => {
    const { wrapper, store, mapping } = mountPanel()
    store.addTransformationRule(mapping.id, {
      expression: '$substring($, 0, 47) & "..."',
      label: 'Afkappen',
      source: 'mismatch-solution',
      resolvesMismatch: 'truncate',
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mismatch-status-truncate"]').text()).toBe('✓ Opgelost')
  })

  it('does not show mismatch cards section when no mismatches are detected', async () => {
    const { wrapper } = mountPanel('src-compatible', 'tgt-compatible')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mismatch-card-truncate"]').exists()).toBe(false)
  })
})

describe('CouplingDetailPanel — rule list', () => {
  // Scenario: A conflict warning appears when two rules share the same resolvesMismatch type
  it('shows conflict warning on both cards when two rules share the same resolvesMismatch type', async () => {
    const { wrapper, store, mapping } = mountPanel()
    store.addTransformationRule(mapping.id, {
      expression: '$substring($, 0, 47) & "..."',
      label: 'Afkappen 1',
      source: 'mismatch-solution',
      resolvesMismatch: 'truncate',
    })
    store.addTransformationRule(mapping.id, {
      expression: '$substring($, 0, 44) & "..."',
      label: 'Afkappen 2',
      source: 'manual',
      resolvesMismatch: 'truncate',
    })
    await wrapper.vm.$nextTick()
    const icons = wrapper.findAll('[data-testid="conflict-warning"]')
    expect(icons).toHaveLength(2)
    expect(icons[0]!.attributes('title')).toBe('Twee regels lossen hetzelfde probleem op')
  })

  // Scenario: The inline expression editor saves a manual rule
  it('adds a manual rule when a valid JSONata expression is entered and saved', async () => {
    const { wrapper, store, mapping } = mountPanel()
    await wrapper.find('[data-testid="add-expression-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="expression-input"]').setValue('$uppercase($)')
    await wrapper.find('[data-testid="expression-save-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    const rules = store.mappings.find((m) => m.id === mapping.id)!.transformations
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe('manual')
    expect(rules[0]!.expression).toBe('$uppercase($)')
  })

  // Scenario: The inline expression editor rejects invalid JSONata
  it('shows an error for invalid JSONata and does not add a rule', async () => {
    const { wrapper, store, mapping } = mountPanel()
    await wrapper.find('[data-testid="add-expression-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="expression-input"]').setValue('$string(')
    await wrapper.find('[data-testid="expression-save-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="expression-error"]').exists()).toBe(true)
    expect(store.mappings.find((m) => m.id === mapping.id)!.transformations).toHaveLength(0)
  })

  // Scenario: Deleting a rule that resolved a mismatch reverts the mismatch to unresolved
  it('reverts mismatch to unresolved when the resolving rule is deleted', async () => {
    const { wrapper, store, mapping } = mountPanel()
    store.addTransformationRule(mapping.id, {
      expression: '$substring($, 0, 47) & "..."',
      label: 'Afkappen',
      source: 'mismatch-solution',
      resolvesMismatch: 'truncate',
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mismatch-status-truncate"]').text()).toBe('✓ Opgelost')

    const ruleId = store.mappings.find((m) => m.id === mapping.id)!.transformations[0]!.id
    await wrapper.find(`[data-testid="rule-delete-${ruleId}"]`).trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="mismatch-status-truncate"]').text()).toBe('● Vereist')
  })
})
