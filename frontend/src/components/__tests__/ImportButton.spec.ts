import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ImportButton from '../ImportButton.vue'

describe('ImportButton', () => {
  it('emits file-selected when the user picks a file', async () => {
    const wrapper = mount(ImportButton)
    const file = new File(['{}'], 'export.json', { type: 'application/json' })

    const input = wrapper.find<HTMLInputElement>('[data-testid="import-file-input"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    const events = wrapper.emitted('file-selected')
    expect(events).toHaveLength(1)
    expect(events![0]![0]).toBe(file)
  })

  it('does not emit when the user cancels (no file selected)', async () => {
    const wrapper = mount(ImportButton)
    const input = wrapper.find<HTMLInputElement>('[data-testid="import-file-input"]')
    Object.defineProperty(input.element, 'files', { value: [], configurable: true })
    await input.trigger('change')

    expect(wrapper.emitted('file-selected')).toBeUndefined()
  })

  it('clicking the visible button opens the file picker', async () => {
    const wrapper = mount(ImportButton, { attachTo: document.body })
    let clicked = false
    const input = wrapper.find<HTMLInputElement>('[data-testid="import-file-input"]')
    input.element.addEventListener('click', () => {
      clicked = true
    })
    await wrapper.find('button').trigger('click')
    expect(clicked).toBe(true)
    wrapper.unmount()
  })

  it('renders an inline error message when error prop is set', () => {
    const wrapper = mount(ImportButton, { props: { error: 'Ongeldig importbestand' } })
    const errorEl = wrapper.find('[data-testid="import-error"]')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toContain('Ongeldig importbestand')
  })

  it('does not render the error element when error prop is empty', () => {
    const wrapper = mount(ImportButton, { props: { error: null } })
    expect(wrapper.find('[data-testid="import-error"]').exists()).toBe(false)
  })

  it('renders inline warnings when warnings prop is non-empty', () => {
    const wrapper = mount(ImportButton, {
      props: { warnings: ['Unknown version 2.0'] },
    })
    const warnEl = wrapper.find('[data-testid="import-warning"]')
    expect(warnEl.exists()).toBe(true)
    expect(warnEl.text()).toContain('Unknown version 2.0')
  })
})
