import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useMappings } from '@/composables/useMappings'
import TruncationDialog from '../TruncationDialog.vue'
import DefaultValueDialog from '../DefaultValueDialog.vue'
import CastConfirmDialog from '../CastConfirmDialog.vue'
import DateFormatDialog from '../DateFormatDialog.vue'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('TruncationDialog', () => {
  function mount_() {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!
    return { wrapper: mount(TruncationDialog, { props: { mappingId: mapping.id, sourcePath: 'zaak.omschrijving' } }), store, mapping }
  }

  it('saves a truncation rule on confirm', async () => {
    const { wrapper, store, mapping } = mount_()
    await wrapper.find('input[type="number"]').setValue('50')
    await wrapper.find('[data-testid="save-button"]').trigger('click')

    const rules = store.mappings.find((m) => m.id === mapping.id)!.transformations
    expect(rules).toHaveLength(1)
    expect(rules[0]!.resolvesMismatch).toBe('truncate')
    expect(rules[0]!.source).toBe('mismatch-solution')
    expect(rules[0]!.expression).toBe('$length(zaak.omschrijving) > 50 ? $substring(zaak.omschrijving, 0, 47) & "..." : zaak.omschrijving')
  })

  it('emits close after save', async () => {
    const { wrapper } = mount_()
    await wrapper.find('input[type="number"]').setValue('50')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('disables save button when input is empty', () => {
    const { wrapper } = mount_()
    const btn = wrapper.find('[data-testid="save-button"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('emits close on cancel without adding a rule', async () => {
    const { wrapper, store, mapping } = mount_()
    await wrapper.find('[data-testid="cancel-button"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
    expect(store.mappings.find((m) => m.id === mapping.id)!.transformations).toHaveLength(0)
  })
})

describe('DefaultValueDialog', () => {
  function mount_() {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!
    return { wrapper: mount(DefaultValueDialog, { props: { mappingId: mapping.id, sourcePath: 'zaak.status' } }), store, mapping }
  }

  it('saves a default value rule on confirm', async () => {
    const { wrapper, store, mapping } = mount_()
    await wrapper.find('input[type="text"]').setValue('onbekend')
    await wrapper.find('[data-testid="save-button"]').trigger('click')

    const rules = store.mappings.find((m) => m.id === mapping.id)!.transformations
    expect(rules[0]!.resolvesMismatch).toBe('default')
    expect(rules[0]!.source).toBe('mismatch-solution')
    expect(rules[0]!.expression).toBe('zaak.status != null ? zaak.status : "onbekend"')
  })

  it('disables save button when input is empty', () => {
    const { wrapper } = mount_()
    const btn = wrapper.find('[data-testid="save-button"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('CastConfirmDialog', () => {
  function mount_() {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!
    return {
      wrapper: mount(CastConfirmDialog, { props: { mappingId: mapping.id, sourcePath: 'zaak.id', fromType: 'number', toType: 'string' } }),
      store,
      mapping,
    }
  }

  it('saves a cast rule on confirm without user input', async () => {
    const { wrapper, store, mapping } = mount_()
    await wrapper.find('[data-testid="save-button"]').trigger('click')

    const rules = store.mappings.find((m) => m.id === mapping.id)!.transformations
    expect(rules[0]!.resolvesMismatch).toBe('cast')
    expect(rules[0]!.source).toBe('mismatch-solution')
    expect(rules[0]!.expression).toBe('$string(zaak.id)')
  })

  it('displays the source and target types', () => {
    const { wrapper } = mount_()
    expect(wrapper.text()).toContain('number')
    expect(wrapper.text()).toContain('string')
  })
})

describe('DateFormatDialog', () => {
  function mount_() {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!
    return { wrapper: mount(DateFormatDialog, { props: { mappingId: mapping.id, sourcePath: 'zaak.datum' } }), store, mapping }
  }

  it('saves a date-format rule on confirm', async () => {
    const { wrapper, store, mapping } = mount_()
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0]!.setValue('YYYY-MM-DD')
    await inputs[1]!.setValue('DD/MM/YYYY')
    await wrapper.find('[data-testid="save-button"]').trigger('click')

    const rules = store.mappings.find((m) => m.id === mapping.id)!.transformations
    expect(rules[0]!.resolvesMismatch).toBe('date-format')
    expect(rules[0]!.source).toBe('mismatch-solution')
    expect(rules[0]!.solutionParams).toMatchObject({ type: 'date-format', sourceFormat: 'YYYY-MM-DD', targetFormat: 'DD/MM/YYYY' })
  })

  it('disables save button when either format is empty', () => {
    const { wrapper } = mount_()
    const btn = wrapper.find('[data-testid="save-button"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })
})
