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

  it('wraps the matching substring in a mark element when highlightQuery is provided', () => {
    const wrapper = mount(FieldPath, { props: { path: 'zaak.naam', highlightQuery: 'naam' } })
    const mark = wrapper.find('mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('naam')
  })

  it('highlights a match that spans within a segment, not across dots', () => {
    const wrapper = mount(FieldPath, { props: { path: 'adres.postcode', highlightQuery: 'post' } })
    const mark = wrapper.find('mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('post')
  })

  it('does not render mark elements when highlightQuery is empty', () => {
    const wrapper = mount(FieldPath, { props: { path: 'zaak.naam', highlightQuery: '' } })
    expect(wrapper.find('mark').exists()).toBe(false)
  })

  it('matching is case-insensitive', () => {
    const wrapper = mount(FieldPath, { props: { path: 'zaak.Naam', highlightQuery: 'naam' } })
    const mark = wrapper.find('mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('Naam')
  })
})
