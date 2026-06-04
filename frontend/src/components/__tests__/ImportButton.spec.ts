import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  it('renders a centered toast for the error prop', async () => {
    const wrapper = mount(ImportButton, {
      props: { error: 'Ongeldig importbestand' },
      attachTo: document.body,
    })
    const errorEl = document.body.querySelector('[data-testid="import-error"]')
    expect(errorEl).not.toBeNull()
    expect(errorEl!.textContent).toContain('Ongeldig importbestand')
    const container = document.body.querySelector('[data-testid="import-toast-container"]')
    expect(container?.className).toMatch(/items-center/)
    expect(container?.className).toMatch(/justify-center/)
    wrapper.unmount()
  })

  it('does not render the toast when error and warnings are empty', () => {
    const wrapper = mount(ImportButton, {
      props: { error: null },
      attachTo: document.body,
    })
    expect(document.body.querySelector('[data-testid="import-toast-container"]')).toBeNull()
    wrapper.unmount()
  })

  it('renders warnings as a toast when warnings prop is non-empty', () => {
    const wrapper = mount(ImportButton, {
      props: { warnings: ['Unknown version 2.0'] },
      attachTo: document.body,
    })
    const warnEl = document.body.querySelector('[data-testid="import-warning"]')
    expect(warnEl).not.toBeNull()
    expect(warnEl!.textContent).toContain('Unknown version 2.0')
    wrapper.unmount()
  })

  describe('toast dismissal', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('emits dismiss-error when the close button is clicked', async () => {
      const wrapper = mount(ImportButton, {
        props: { error: 'Boom' },
        attachTo: document.body,
      })
      const dismissEl = document.body.querySelector(
        '[data-testid="import-error-dismiss"]',
      ) as HTMLElement | null
      expect(dismissEl).not.toBeNull()
      dismissEl!.click()
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('dismiss-error')).toHaveLength(1)
      wrapper.unmount()
    })

    it('auto-dismisses the error toast after 5 seconds', async () => {
      const wrapper = mount(ImportButton, {
        props: { error: 'Boom' },
        attachTo: document.body,
      })
      expect(wrapper.emitted('dismiss-error')).toBeUndefined()
      vi.advanceTimersByTime(5000)
      expect(wrapper.emitted('dismiss-error')).toHaveLength(1)
      wrapper.unmount()
    })

    it('auto-dismisses the warning toast after 5 seconds', async () => {
      const wrapper = mount(ImportButton, {
        props: { warnings: ['heads up'] },
        attachTo: document.body,
      })
      vi.advanceTimersByTime(5000)
      expect(wrapper.emitted('dismiss-warnings')).toHaveLength(1)
      wrapper.unmount()
    })
  })
})
