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

  // Scenario: Reasoning is collapsed by default
  describe('reasoning', () => {
    it('shows a Toelichting toggle but keeps the reasoning collapsed by default', () => {
      const wrapper = mountCard({
        suggestionId: 'sug-1',
        sourceName: 'customerId',
        targetName: 'client_id',
        confidenceScore: 0.97,
        reasoning: 'Beide velden bevatten het klant-identificatienummer.',
      })

      expect(wrapper.find('[data-testid="toelichting-toggle"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="toelichting-text"]').exists()).toBe(false)
    })

    it('does not show a Toelichting toggle when no reasoning is present', () => {
      const wrapper = mountCard()
      expect(wrapper.find('[data-testid="toelichting-toggle"]').exists()).toBe(false)
    })

    // Scenario: Expanding Toelichting reveals the AI's reasoning
    it('reveals the reasoning text when the Toelichting toggle is clicked', async () => {
      const wrapper = mountCard({
        suggestionId: 'sug-1',
        sourceName: 'customerId',
        targetName: 'client_id',
        confidenceScore: 0.97,
        reasoning: 'Beide velden bevatten het klant-identificatienummer.',
      })

      await wrapper.find('[data-testid="toelichting-toggle"]').trigger('click')

      const text = wrapper.find('[data-testid="toelichting-text"]')
      expect(text.exists()).toBe(true)
      expect(text.text()).toBe('Beide velden bevatten het klant-identificatienummer.')
    })

    // Scenario: Unusually long reasoning stays readable
    it('wraps unusually long reasoning instead of breaking the card layout', async () => {
      const longReasoning =
        'Beide velden verwijzen naar hetzelfde klant-identificatienummer, zoals gebruikt in het bronsysteem en het doelsysteem, ' +
        'en de naamgeving van beide velden komt sterk overeen ondanks het verschil in schrijfwijze tussen de twee schema-conventies.'
      const wrapper = mountCard({
        suggestionId: 'sug-1',
        sourceName: 'customerId',
        targetName: 'client_id',
        confidenceScore: 0.97,
        reasoning: longReasoning,
      })

      await wrapper.find('[data-testid="toelichting-toggle"]').trigger('click')

      const text = wrapper.find('[data-testid="toelichting-text"]')
      expect(text.text()).toBe(longReasoning)
      expect(text.classes()).toContain('break-words')
    })
  })
})
