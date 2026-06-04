import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AISuggestionCard from '../AISuggestionCard.vue'

function mountCard(
  props = {
    suggestionId: 'sug-1',
    sourceName: 'customerId',
    targetName: 'client_id',
    confidenceScore: 0.97,
  },
) {
  return mount(AISuggestionCard, { props })
}

describe('AISuggestionCard', () => {
  it('displays source and target field names', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('customerId')
    expect(wrapper.text()).toContain('client_id')
  })

  it('shows Hoog badge for score ≥ 0.8', () => {
    const wrapper = mountCard()
    const badge = wrapper.find('[data-testid="confidence-badge"]')
    expect(badge.text()).toContain('Hoog')
    expect(badge.text()).toContain('97%')
    expect(badge.classes().join(' ')).toMatch(/green/)
  })

  it('shows Middel badge for score 0.5–0.79', () => {
    const wrapper = mountCard({
      suggestionId: 'sug-1',
      sourceName: 'a',
      targetName: 'b',
      confidenceScore: 0.72,
    })
    const badge = wrapper.find('[data-testid="confidence-badge"]')
    expect(badge.text()).toContain('Middel')
    expect(badge.text()).toContain('72%')
    expect(badge.classes().join(' ')).toMatch(/amber/)
  })

  it('shows Laag badge for score < 0.5', () => {
    const wrapper = mountCard({
      suggestionId: 'sug-1',
      sourceName: 'a',
      targetName: 'b',
      confidenceScore: 0.3,
    })
    const badge = wrapper.find('[data-testid="confidence-badge"]')
    expect(badge.text()).toContain('Laag')
    expect(badge.text()).toContain('30%')
    expect(badge.classes().join(' ')).toMatch(/red/)
  })

  it('emits accept with the suggestion id when Accepteer is clicked', async () => {
    const wrapper = mountCard()
    await wrapper.find('[data-testid="accept-button"]').trigger('click')
    expect(wrapper.emitted('accept')).toEqual([['sug-1']])
  })

  it('emits reject with the suggestion id when Afwijzen is clicked', async () => {
    const wrapper = mountCard()
    await wrapper.find('[data-testid="reject-button"]').trigger('click')
    expect(wrapper.emitted('reject')).toEqual([['sug-1']])
  })

  it('hides accept and reject buttons when interactive is false', () => {
    const wrapper = mount(AISuggestionCard, {
      props: {
        suggestionId: 'sug-1',
        sourceName: 'a',
        targetName: 'b',
        confidenceScore: 0.6,
        interactive: false,
      },
    })
    expect(wrapper.find('[data-testid="accept-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reject-button"]').exists()).toBe(false)
  })

  it('shows accept and reject buttons by default', () => {
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="accept-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reject-button"]').exists()).toBe(true)
  })
})
