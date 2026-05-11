import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CouplingDetailPanel from '../CouplingDetailPanel.vue'
import { useMappings } from '@/composables/useMappings'
import type { SchemaField } from '@/types'

const sourceFields: SchemaField[] = [
  { id: 'src-1', name: 'naam', path: 'naam', dataType: 'string', required: false },
  { id: 'src-2', name: 'beschrijving', path: 'beschrijving', dataType: 'string', required: false, maxLength: 100 },
  { id: 'src-3', name: 'adres', path: 'adres', dataType: 'object', required: false },
  { id: 'src-opt', name: 'opmerking', path: 'opmerking', dataType: 'string', required: false },
  { id: 'src-req', name: 'verplicht_bron', path: 'verplicht_bron', dataType: 'string', required: true },
  { id: 'src-opt-num', name: 'aantal', path: 'aantal', dataType: 'number', required: false },
  { id: 'src-date', name: 'geboortedatum', path: 'geboortedatum', dataType: 'date', required: false },
]

const targetFields: SchemaField[] = [
  { id: 'tgt-1', name: 'volledige_naam', path: 'volledige_naam', dataType: 'string', required: false },
  { id: 'tgt-2', name: 'omschrijving', path: 'omschrijving', dataType: 'string', required: false, maxLength: 50 },
  { id: 'tgt-3', name: 'adresString', path: 'adresString', dataType: 'string', required: false },
  { id: 'tgt-req', name: 'toelichting', path: 'toelichting', dataType: 'string', required: true },
  { id: 'tgt-req-num', name: 'nummer', path: 'nummer', dataType: 'number', required: true },
  { id: 'tgt-date', name: 'datum', path: 'datum', dataType: 'date', required: false },
]

function mountPanel() {
  return mount(CouplingDetailPanel, {
    global: { plugins: [createPinia()] },
    props: { sourceFields, targetFields },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('CouplingDetailPanel', () => {
  // Scenario: Detail panel shows field info for a compatible coupling
  it('shows source and target field names and types for a compatible coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.selectMapping(mapping!.id)
    await wrapper.vm.$nextTick()

    const panel = wrapper.find('[data-testid="coupling-detail-panel"]')
    expect(panel.exists()).toBe(true)
    expect(wrapper.find('[data-testid="detail-source-field"]').text()).toContain('naam')
    expect(wrapper.find('[data-testid="detail-source-field"]').text()).toContain('str')
    expect(wrapper.find('[data-testid="detail-target-field"]').text()).toContain('volledige_naam')
    expect(wrapper.find('[data-testid="detail-target-field"]').text()).toContain('str')
  })

  it('shows compatible validation status and no transformation input for a compatible coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.selectMapping(mapping!.id)
    await wrapper.vm.$nextTick()

    const validationSection = wrapper.find('[data-testid="detail-validation-section"]')
    expect(validationSection.text()).toContain('compatibel')
    expect(wrapper.find('[data-testid="transformation-placeholder"]').exists()).toBe(false)
  })

  // Scenario: Detail panel shows constraint reason for a constrained coupling
  it('shows constraint reason and truncation form for a constrained string coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    // src-2: string maxLength 100, tgt-2: string maxLength 50 → constrained
    const mapping = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })
    store.selectMapping(mapping!.id)
    await wrapper.vm.$nextTick()

    const validationSection = wrapper.find('[data-testid="detail-validation-section"]')
    expect(validationSection.text()).toMatch(/100|50|truncat/i)
    expect(wrapper.find('[data-testid="truncation-form"]').exists()).toBe(true)
  })

  // Scenario: Detail panel shows constraint reason for unbounded source → bounded target
  it('shows truncation form when source has no maxLength but target does', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    // src-1: string no maxLength, tgt-2: string maxLength 50 → constrained
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    store.selectMapping(mapping!.id)
    await wrapper.vm.$nextTick()

    const validationSection = wrapper.find('[data-testid="detail-validation-section"]')
    expect(validationSection.text()).toMatch(/50|afkapping/i)
    expect(wrapper.find('[data-testid="truncation-form"]').exists()).toBe(true)
  })

  // Scenario: Detail panel shows incompatibility reason for an incompatible coupling
  it('shows incompatibility reason and remap note for an incompatible coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    // src-3: object, tgt-3: string → incompatible
    const mapping = store.createMapping({ sourceFieldId: 'src-3', targetFieldId: 'tgt-3' })
    store.selectMapping(mapping!.id)
    await wrapper.vm.$nextTick()

    const validationSection = wrapper.find('[data-testid="detail-validation-section"]')
    expect(validationSection.text()).toMatch(/object|string|remap/i)
    expect(wrapper.find('[data-testid="transformation-placeholder"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="remap-note"]').exists()).toBe(true)
  })

  // Scenario: Closing the detail panel clears the selection
  it('clears the selected mapping when the close button is clicked', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.selectMapping(mapping!.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="coupling-detail-panel"]').exists()).toBe(true)
    await wrapper.find('[data-testid="detail-close"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(store.selectedMappingId).toBeNull()
  })

  // Scenario: Detail panel is not shown when no coupling is selected
  it('does not render the panel when no coupling is selected', () => {
    const wrapper = mountPanel()
    // selectedMappingId is null by default
    expect(wrapper.find('[data-testid="coupling-detail-panel"]').exists()).toBe(false)
  })
})

describe('CouplingDetailPanel — truncation form', () => {
  // Scenario: Truncation form is shown for a constrained string-to-string coupling
  it('pre-fills truncation input with target maxLength', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    const input = wrapper.find<HTMLInputElement>('[data-testid="truncation-input"]')
    expect(Number(input.element.value)).toBe(50)
  })

  it('pre-fills truncation input when mounted with mapping already selected (v-if scenario)', async () => {
    // Mirrors the real app: panel mounts fresh because parent uses v-if="selectedMappingId !== null"
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })!
    store.selectMapping(mapping.id)

    // Mount AFTER selection is already set — watch must be immediate to catch this
    const wrapper = mount(CouplingDetailPanel, {
      global: { plugins: [pinia] },
      props: { sourceFields, targetFields },
    })
    await wrapper.vm.$nextTick()

    const input = wrapper.find<HTMLInputElement>('[data-testid="truncation-input"]')
    expect(Number(input.element.value)).toBe(50)
  })

  // Scenario: Administrator saves a valid truncation rule
  it('saves truncation rule and shows read-only summary after clicking Opslaan', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="truncation-input"]').setValue(40)
    await wrapper.find('[data-testid="truncation-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="truncation-form"]').exists()).toBe(false)
    const summary = wrapper.find('[data-testid="truncation-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('40')
    expect(summary.text()).toContain('37')

    const saved = store.mappings.find((m) => m.id === mapping.id)!
    const rule = saved.transformations.find((r) => r.type === 'truncate')
    expect(rule?.type).toBe('truncate')
    expect(rule?.truncationMaxLength).toBe(40)
  })

  // Scenario: Entering a truncation length exceeding the target maxLength shows an error
  it('shows inline error and disables Opslaan when value exceeds target maxLength', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="truncation-input"]').setValue(80)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="truncation-error"]').exists()).toBe(true)
    const saveBtn = wrapper.find<HTMLButtonElement>('[data-testid="truncation-save"]')
    expect(saveBtn.element.disabled).toBe(true)
  })

  // Scenario: Administrator can edit an existing truncation rule
  it('re-opens form pre-filled with saved value when Wijzigen is clicked', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="truncation-input"]').setValue(40)
    await wrapper.find('[data-testid="truncation-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="truncation-edit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="truncation-form"]').exists()).toBe(true)
    const input = wrapper.find<HTMLInputElement>('[data-testid="truncation-input"]')
    expect(Number(input.element.value)).toBe(40)
  })

  // Scenario: Truncation form is not shown for incompatible or compatible couplings
  it('does not show truncation form for an incompatible coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    // src-3: object, tgt-3: string → incompatible
    const mapping = store.createMapping({ sourceFieldId: 'src-3', targetFieldId: 'tgt-3' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="truncation-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="truncation-summary"]').exists()).toBe(false)
  })

  // Edge case: value below minimum (4)
  it('shows error for input below 4', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="truncation-input"]').setValue(2)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="truncation-error"]').exists()).toBe(true)
    expect(wrapper.find<HTMLButtonElement>('[data-testid="truncation-save"]').element.disabled).toBe(true)
  })
})

describe('CouplingDetailPanel — default value form', () => {
  // Scenario: Default value form shown for non-required source mapped to required target
  it('shows default value form when source is not required and target is required', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt', targetFieldId: 'tgt-req' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="default-value-form"]').exists()).toBe(true)
    const input = wrapper.find<HTMLInputElement>('[data-testid="default-value-input"]')
    expect(input.exists()).toBe(true)
    expect(input.element.required).toBe(true)
  })

  // Scenario: Administrator saves a valid default value
  it('saves default value rule and shows read-only summary after clicking Opslaan', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt', targetFieldId: 'tgt-req' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="default-value-input"]').setValue('onbekend')
    await wrapper.find('[data-testid="default-value-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="default-value-form"]').exists()).toBe(false)
    const summary = wrapper.find('[data-testid="default-value-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('onbekend')

    const saved = store.mappings.find((m) => m.id === mapping.id)!
    const rule = saved.transformations.find((r) => r.type === 'default')
    expect(rule?.type).toBe('default')
    expect(rule?.defaultValue).toBe('onbekend')
  })

  // Scenario: Saving without entering a value is blocked
  it('shows inline error and does not save when value is empty', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt', targetFieldId: 'tgt-req' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="default-value-input"]').setValue('')
    await wrapper.find('[data-testid="default-value-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="default-value-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="default-value-summary"]').exists()).toBe(false)
    const saved = store.mappings.find((m) => m.id === mapping.id)!
    expect(saved.transformations.find((r) => r.type === 'default')).toBeUndefined()
  })

  // Scenario: Non-numeric value for a number target field shows an error
  it('shows error and disables Opslaan when non-numeric value entered for number target', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt-num', targetFieldId: 'tgt-req-num' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="default-value-input"]').setValue('abc')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="default-value-error"]').exists()).toBe(true)
    expect(wrapper.find<HTMLButtonElement>('[data-testid="default-value-save"]').element.disabled).toBe(true)
  })

  // Scenario: Administrator can edit a saved default value
  it('re-opens form pre-filled with saved value when Wijzigen is clicked', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt', targetFieldId: 'tgt-req' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="default-value-input"]').setValue('onbekend')
    await wrapper.find('[data-testid="default-value-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="default-value-edit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="default-value-form"]').exists()).toBe(true)
    const input = wrapper.find<HTMLInputElement>('[data-testid="default-value-input"]')
    expect(input.element.value).toBe('onbekend')
  })

  // Regression: Vue auto-converts type="number" input value to a number — String() must be used
  it('saves a valid number value when Vue provides the value as a number type', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt-num', targetFieldId: 'tgt-req-num' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    // Simulate Vue passing a number (as it does internally for type="number" inputs)
    await wrapper.find('[data-testid="default-value-input"]').setValue(42)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="default-value-error"]').exists()).toBe(false)
    const saveBtn = wrapper.find<HTMLButtonElement>('[data-testid="default-value-save"]')
    expect(saveBtn.element.disabled).toBe(false)

    await saveBtn.trigger('click')
    await wrapper.vm.$nextTick()

    const saved = store.mappings.find((m) => m.id === mapping.id)!
    const rule = saved.transformations.find((r) => r.type === 'default')
    expect(rule?.defaultValue).toBe('42')
  })

  // Scenario: Form not shown when source is required
  it('does not show default value form when source field is required', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-req', targetFieldId: 'tgt-req' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="default-value-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="default-value-summary"]').exists()).toBe(false)
  })
})

describe('CouplingDetailPanel — type casting section', () => {
  // Scenario: Type casting section shown for compatible-but-different-type coupling
  it('shows cast section with direction label and confirm button for number→string coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    // src-opt-num: number, non-required; tgt-1: string, non-required → constrained + different types
    const mapping = store.createMapping({ sourceFieldId: 'src-opt-num', targetFieldId: 'tgt-1' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    const section = wrapper.find('[data-testid="cast-section"]')
    expect(section.exists()).toBe(true)
    expect(section.text()).toContain('number wordt omgezet naar string')
    expect(wrapper.find('[data-testid="cast-confirm"]').exists()).toBe(true)
  })

  // Scenario: Administrator confirms the type cast
  it('saves cast rule and shows read-only summary after clicking Bevestig type casting', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt-num', targetFieldId: 'tgt-1' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="cast-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="cast-section"]').exists()).toBe(false)
    const summary = wrapper.find('[data-testid="cast-summary"]')
    expect(summary.exists()).toBe(true)

    const saved = store.mappings.find((m) => m.id === mapping.id)!
    const rule = saved.transformations.find((r) => r.type === 'cast')
    expect(rule?.castFrom).toBe('number')
    expect(rule?.castTo).toBe('string')
  })

  // Scenario: Administrator removes the type cast rule
  it('resets to direct and shows confirm button again when Wijzigen is clicked', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-opt-num', targetFieldId: 'tgt-1' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="cast-confirm"]').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="cast-edit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="cast-summary"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cast-section"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cast-confirm"]').exists()).toBe(true)

    const saved = store.mappings.find((m) => m.id === mapping.id)!
    expect(saved.transformations.find((r) => r.type === 'cast')).toBeUndefined()
  })

  // Scenario: Type casting section not shown for same-type couplings
  it('does not show cast section for a same-type compatible coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    // src-1: string, tgt-1: string → compatible (no forms shown)
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="cast-section"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cast-summary"]').exists()).toBe(false)
  })

  // Scenario: Type casting section not shown for incompatible couplings
  it('does not show cast section for an incompatible coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    // src-3: object, tgt-3: string → incompatible
    const mapping = store.createMapping({ sourceFieldId: 'src-3', targetFieldId: 'tgt-3' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="cast-section"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cast-summary"]').exists()).toBe(false)
  })
})

describe('CouplingDetailPanel — date format section', () => {
  // Scenario: Date format section shown for date-to-date coupling
  it('shows date format section with inputs for source and target format for a date-to-date coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-date', targetFieldId: 'tgt-date' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="date-format-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="source-format-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="target-format-input"]').exists()).toBe(true)
  })

  // Scenario: Administrator saves a valid date format conversion rule
  it('saves date format rule and shows read-only summary after clicking Opslaan', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-date', targetFieldId: 'tgt-date' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="source-format-input"]').setValue('dd-MM-yyyy')
    await wrapper.find('[data-testid="target-format-input"]').setValue('yyyy-MM-dd')
    await wrapper.find('[data-testid="date-format-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="date-format-form"]').exists()).toBe(false)
    const summary = wrapper.find('[data-testid="date-format-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('dd-MM-yyyy')
    expect(summary.text()).toContain('yyyy-MM-dd')

    const saved = store.mappings.find((m) => m.id === mapping.id)!
    const rule = saved.transformations.find((r) => r.type === 'date-format')
    expect(rule?.sourceDateFormat).toBe('dd-MM-yyyy')
    expect(rule?.targetDateFormat).toBe('yyyy-MM-dd')
  })

  // Scenario: Saving with an empty format field is blocked
  it('shows inline error and does not save when source format is empty', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-date', targetFieldId: 'tgt-date' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="source-format-input"]').setValue('')
    await wrapper.find('[data-testid="date-format-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="date-format-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="date-format-summary"]').exists()).toBe(false)
    const saved = store.mappings.find((m) => m.id === mapping.id)!
    expect(saved.transformations.find((r) => r.type === 'date-format')).toBeUndefined()
  })

  // Scenario: Administrator can edit a saved date format rule
  it('re-opens form pre-filled with saved formats when Wijzigen is clicked', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-date', targetFieldId: 'tgt-date' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="source-format-input"]').setValue('dd-MM-yyyy')
    await wrapper.find('[data-testid="target-format-input"]').setValue('yyyy-MM-dd')
    await wrapper.find('[data-testid="date-format-save"]').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="date-format-edit"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="date-format-form"]').exists()).toBe(true)
    expect(wrapper.find<HTMLInputElement>('[data-testid="source-format-input"]').element.value).toBe('dd-MM-yyyy')
    expect(wrapper.find<HTMLInputElement>('[data-testid="target-format-input"]').element.value).toBe('yyyy-MM-dd')
  })

  // Scenario: Date format section not shown for non-date couplings
  it('does not show date format section for a string-to-string coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="date-format-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="date-format-summary"]').exists()).toBe(false)
  })

  // Scenario: Format pre-filled from OpenAPI spec when field format is date
  it('pre-fills both format inputs with yyyy-MM-dd for a date-to-date coupling', async () => {
    const wrapper = mountPanel()
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-date', targetFieldId: 'tgt-date' })!
    store.selectMapping(mapping.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.find<HTMLInputElement>('[data-testid="source-format-input"]').element.value).toBe('yyyy-MM-dd')
    expect(wrapper.find<HTMLInputElement>('[data-testid="target-format-input"]').element.value).toBe('yyyy-MM-dd')
  })
})
