import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FieldPath from '../FieldPath.vue'

describe('FieldPath', () => {
  it('renders a flat path without wbr elements', () => {
    const wrapper = mount(FieldPath, { props: { path: 'naam' } })
    expect(wrapper.text()).toBe('naam')
    expect(wrapper.find('wbr').exists()).toBe(false)
  })

  it('renders all segments of a nested path', () => {
    const wrapper = mount(FieldPath, { props: { path: 'adres.postcode' } })
    expect(wrapper.text()).toContain('adres')
    expect(wrapper.text()).toContain('postcode')
  })

  it('inserts a wbr after each dot separator', () => {
    const wrapper = mount(FieldPath, { props: { path: 'a.b.c' } })
    expect(wrapper.findAll('wbr')).toHaveLength(2)
  })

  it('preserves the dots between segments in text content', () => {
    const wrapper = mount(FieldPath, { props: { path: 'zaak.identificatie' } })
    expect(wrapper.text()).toContain('zaak.identificatie')
  })
})
