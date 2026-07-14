import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AISuggestionPanel from '../AISuggestionPanel.vue'
import { useAISuggestions, AIServiceError } from '@/composables/useAISuggestions'
import { useMappings } from '@/composables/useMappings'
import { useApiKey, resetApiKeyState, syncEnvKey } from '@/composables/useApiKey'
import type { AiSuggestion } from '@/types'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'

const sourceNodes: SchemaFieldNode[] = [
  {
    id: 'src-1',
    name: 'identificatie',
    path: 'Zaak.identificatie',
    dataType: 'string',
    required: true,
  },
]
const targetNodes: SchemaFieldNode[] = [
  { id: 'tgt-1', name: 'uuid', path: 'Zaak.uuid', dataType: 'string', required: true },
  {
    id: 'tgt-2',
    name: 'omschrijving',
    path: 'Zaak.omschrijving',
    dataType: 'string',
    required: true,
  },
]

const sourceSchema = buildSchema('', sourceNodes)
const targetSchema = buildSchema('', targetNodes)

function mountPanel(props = { sourceSchema, targetSchema }) {
  return mount(AISuggestionPanel, {
    global: { plugins: [createPinia()], stubs: { Teleport: true } },
    props,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetApiKeyState()
  useApiKey().provideKey('test-key')
})

afterEach(() => {
  resetApiKeyState()
})

describe('AISuggestionPanel', () => {
  // Scenario: Panel shows generate button when no suggestions and unmapped fields exist
  it('shows the generate button when there are unmapped target fields and no suggestions', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="generate-button"]').exists()).toBe(true)
  })

  // Scenario: Loading state appears while fetching
  it('shows a loading state while fetching', async () => {
    const wrapper = mountPanel()
    const aiStore = useAISuggestions()
    aiStore.isLoading = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="generate-button"]').exists()).toBe(false)
  })

  // Scenario: Suggestion list shown after generation
  it('shows suggestion cards after suggestions are returned', async () => {
    const wrapper = mountPanel()
    const aiStore = useAISuggestions()
    aiStore.suggestions = [
      {
        id: '1',
        sourceFieldId: 'src-1',
        targetFieldId: 'tgt-1',
        confidenceScore: 0.97,
        status: 'pending',
      },
    ] as AiSuggestion[]
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-testid="suggestion-card"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('identificatie')
    expect(wrapper.text()).toContain('uuid')
  })

  // Scenario: Empty state when no unmapped target fields
  it('shows empty state when all target fields are already mapped', async () => {
    const wrapper = mountPanel()
    const mappingsStore = useMappings()
    mappingsStore.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    // Simulate tgt-2 also mapped
    mappingsStore.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="generate-button"]').exists()).toBe(false)
  })

  it('calls generateSuggestions when generate button is clicked', async () => {
    const wrapper = mountPanel()
    const aiStore = useAISuggestions()
    const spy = vi.spyOn(aiStore, 'generateSuggestions').mockResolvedValue([])
    await wrapper.find('[data-testid="generate-button"]').trigger('click')
    expect(spy).toHaveBeenCalledOnce()
  })

  // Scenario: AI service unreachable
  describe('error state', () => {
    it('shows an inline error message when the AI service is unreachable', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.error = new AIServiceError('AI service unreachable')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
    })

    it('does not show the loading state when an error is present', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.error = new AIServiceError('AI service unreachable')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(false)
    })

    it('shows "Opnieuw genereren" button in error state when unmapped fields exist', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.error = new AIServiceError('AI service unreachable')
      await wrapper.vm.$nextTick()
      const btn = wrapper.find('[data-testid="generate-button"]')
      expect(btn.exists()).toBe(true)
      expect(btn.text()).toBe('Opnieuw genereren')
    })

    it('does not show the generate button in error state when no unmapped fields remain', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      mappingsStore.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
      mappingsStore.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })
      aiStore.error = new AIServiceError('AI service unreachable')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="generate-button"]').exists()).toBe(false)
    })

    it('shows existing suggestions below the error banner (preserve on error)', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: '1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.97,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.error = new AIServiceError('AI service unreachable')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="error-state"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-testid="suggestion-card"]')).toHaveLength(1)
    })

    it('calls generateSuggestions when retry button in error state is clicked', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.error = new AIServiceError('AI service unreachable')
      const spy = vi.spyOn(aiStore, 'generateSuggestions').mockResolvedValue([])
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="generate-button"]').trigger('click')
      expect(spy).toHaveBeenCalledOnce()
    })
  })

  // Scenario: Accepted suggestion appears on the canvas (mapping store updated)
  it('creates a field mapping when Accepteer is clicked on a suggestion card', async () => {
    const wrapper = mountPanel()
    const aiStore = useAISuggestions()
    const mappingsStore = useMappings()
    aiStore.suggestions = [
      {
        id: 'sug-1',
        sourceFieldId: 'src-1',
        targetFieldId: 'tgt-1',
        confidenceScore: 0.97,
        status: 'pending',
      },
    ] as AiSuggestion[]
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="accept-button"]').trigger('click')

    expect(mappingsStore.mappings).toHaveLength(1)
    expect(mappingsStore.mappings[0]).toMatchObject({
      sourceFieldId: 'src-1',
      targetFieldId: 'tgt-1',
    })
    expect(aiStore.suggestions).toHaveLength(0)
  })

  // Scenario: Rejected suggestion disappears
  it('removes the suggestion when Afwijzen is clicked', async () => {
    const wrapper = mountPanel()
    const aiStore = useAISuggestions()
    const mappingsStore = useMappings()
    aiStore.suggestions = [
      {
        id: 'sug-1',
        sourceFieldId: 'src-1',
        targetFieldId: 'tgt-1',
        confidenceScore: 0.97,
        status: 'pending',
      },
    ] as AiSuggestion[]
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="reject-button"]').trigger('click')

    expect(aiStore.suggestions).toHaveLength(0)
    expect(mappingsStore.mappings).toHaveLength(0)
  })

  // Acceptance rate: stats button and dialog
  describe('acceptance rate dialog', () => {
    it('shows stats button when totalGenerated > 0', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.97,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.totalGenerated = 1
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="stats-button"]').exists()).toBe(true)
    })

    it('does not show stats button before any suggestions are generated', async () => {
      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="stats-button"]').exists()).toBe(false)
    })

    it('opens the stats dialog when stats button is clicked', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.totalGenerated = 1
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="stats-button"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="stats-dialog"]').exists()).toBe(true)
    })

    it('shows "0 geaccepteerd" and "0 afgewezen" in dialog initially', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.97,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.totalGenerated = 1
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="stats-button"]').trigger('click')
      await wrapper.vm.$nextTick()

      const dialog = wrapper.find('[data-testid="stats-dialog"]')
      expect(dialog.text()).toContain('0 geaccepteerd')
      expect(dialog.text()).toContain('0 afgewezen')
    })

    // Scenario: Rate is updated after acceptance
    it('updates rate in dialog after accepting a suggestion', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.97,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.totalGenerated = 1
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="stats-button"]').trigger('click')
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="accept-button"]').trigger('click')
      await wrapper.vm.$nextTick()

      const dialog = wrapper.find('[data-testid="stats-dialog"]')
      expect(dialog.text()).toContain('1 geaccepteerd')
      expect(dialog.text()).toContain('0 afgewezen')
    })

    // Scenario: Rate is updated after rejection
    it('updates rate in dialog after rejecting a suggestion', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.97,
          status: 'pending',
        },
        {
          id: 'sug-2',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.8,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.totalGenerated = 2
      aiStore.accepted = 1
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="stats-button"]').trigger('click')
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="reject-button"]').trigger('click')
      await wrapper.vm.$nextTick()

      const dialog = wrapper.find('[data-testid="stats-dialog"]')
      expect(dialog.text()).toContain('1 geaccepteerd')
      expect(dialog.text()).toContain('1 afgewezen')
    })
  })

  describe('no API key placeholder', () => {
    beforeEach(() => {
      resetApiKeyState() // clear sessionKey, storedKey and localStorage
    })

    it('shows the placeholder when no API key is available', async () => {
      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="no-key-placeholder"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="generate-button"]').exists()).toBe(false)
    })

    it('calls getKey when the setup CTA is clicked', async () => {
      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()
      const ctaBtn = wrapper.find('[data-testid="setup-key-button"]')
      expect(ctaBtn.exists()).toBe(true)
      await ctaBtn.trigger('click')
      // getKey() is called on the singleton; isPromptVisible should be true
      const { isPromptVisible } = useApiKey()
      expect(isPromptVisible.value).toBe(true)
    })

    it('shows the generate button after a key is provided', async () => {
      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="no-key-placeholder"]').exists()).toBe(true)

      const { provideKey } = useApiKey()
      provideKey('new-test-key')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="no-key-placeholder"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="generate-button"]').exists()).toBe(true)
    })

    it('shows generate button when env var key is configured', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'env-key-123')
      syncEnvKey() // sync reactive mirror so hasKey reacts to the stub
      const wrapper = mountPanel()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="no-key-placeholder"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="generate-button"]').exists()).toBe(true)
      vi.unstubAllEnvs()
      syncEnvKey() // restore reactive mirror
    })
  })

  // Confidence threshold: panel renders all store suggestions (filtering is store's responsibility)
  describe('confidence threshold', () => {
    it('renders all suggestions present in the store', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'a',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.9,
          status: 'pending',
        },
        {
          id: 'b',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.75,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('[data-testid="suggestion-card"]')).toHaveLength(2)
    })
  })

  // Low-confidence collapsible section
  describe('low confidence section', () => {
    it('shows the low-confidence toggle button when lowConfidenceSuggestions exist', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'a',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.9,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'b',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="low-confidence-toggle"]').exists()).toBe(true)
    })

    it('does not show the toggle when there are no low-confidence suggestions', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'a',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.9,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="low-confidence-toggle"]').exists()).toBe(false)
    })

    it('expands the low-confidence section when toggle is clicked', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'a',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.9,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'b',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="low-confidence-toggle"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="low-confidence-list"]').exists()).toBe(true)
    })

    it('collapses the section when toggle is clicked again', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'b',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ] as AiSuggestion[]
      aiStore.suggestions = [
        {
          id: 'a',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.9,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="low-confidence-toggle"]').trigger('click')
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="low-confidence-toggle"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="low-confidence-list"]').exists()).toBe(false)
    })

    it('low-confidence cards have accept and reject buttons', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      aiStore.suggestions = [] as AiSuggestion[]
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'b',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="low-confidence-toggle"]').trigger('click')
      await wrapper.vm.$nextTick()

      const list = wrapper.find('[data-testid="low-confidence-list"]')
      expect(list.find('[data-testid="accept-button"]').exists()).toBe(true)
      expect(list.find('[data-testid="reject-button"]').exists()).toBe(true)
    })

    it('accepting a low-confidence suggestion creates a mapping and removes it', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      aiStore.suggestions = [] as AiSuggestion[]
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'b',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="low-confidence-toggle"]').trigger('click')
      await wrapper.vm.$nextTick()
      await wrapper
        .find('[data-testid="low-confidence-list"] [data-testid="accept-button"]')
        .trigger('click')
      await wrapper.vm.$nextTick()

      expect(aiStore.lowConfidenceSuggestions).toHaveLength(0)
      expect(mappingsStore.mappings).toHaveLength(1)
    })

    it('rejecting a low-confidence suggestion removes it without creating a mapping', async () => {
      const wrapper = mountPanel()
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      aiStore.suggestions = [] as AiSuggestion[]
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'b',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ] as AiSuggestion[]
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="low-confidence-toggle"]').trigger('click')
      await wrapper.vm.$nextTick()
      await wrapper
        .find('[data-testid="low-confidence-list"] [data-testid="reject-button"]')
        .trigger('click')
      await wrapper.vm.$nextTick()

      expect(aiStore.lowConfidenceSuggestions).toHaveLength(0)
      expect(mappingsStore.mappings).toHaveLength(0)
    })
  })
})
