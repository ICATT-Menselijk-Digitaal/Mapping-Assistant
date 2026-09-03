import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ConnectionLines from '../ConnectionLines.vue'
import { useMappings } from '@/composables/useMappings'
import { useAISuggestions } from '@/composables/useAISuggestions'
import type { AiSuggestion } from '@/types'

function mountWithContainers() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const wrapper = mount(ConnectionLines, {
    global: { plugins: [pinia] },
    attachTo: document.body,
  })

  return { wrapper }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  document.querySelectorAll('[data-field-id]').forEach((el) => el.remove())
})

describe('ConnectionLines', () => {
  it('renders the SVG element', () => {
    const { wrapper } = mountWithContainers()
    expect(wrapper.find('[data-testid="connection-lines-svg"]').exists()).toBe(true)
  })

  // Scenario: Clicking a canvas line selects it
  it('calls selectMapping with the line id when a line group is clicked', async () => {
    const srcEl = document.createElement('div')
    srcEl.setAttribute('data-field-id', 'src-1')
    srcEl.setAttribute('data-field-side', 'source')
    document.body.appendChild(srcEl)

    const tgtEl = document.createElement('div')
    tgtEl.setAttribute('data-field-id', 'tgt-1')
    tgtEl.setAttribute('data-field-side', 'target')
    document.body.appendChild(tgtEl)

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const group = wrapper.find('[data-testid="connection-line-group"]')
    await group.trigger('click')

    const mappingId = store.mappings[0]!.id
    expect(store.selectedMappingId).toBe(mappingId)
  })

  // Scenario: Selected line rendered with highlight style
  it('does not emit delete-requested when a line is clicked', async () => {
    const srcEl = document.createElement('div')
    srcEl.setAttribute('data-field-id', 'src-1')
    srcEl.setAttribute('data-field-side', 'source')
    document.body.appendChild(srcEl)

    const tgtEl = document.createElement('div')
    tgtEl.setAttribute('data-field-id', 'tgt-1')
    tgtEl.setAttribute('data-field-side', 'target')
    document.body.appendChild(tgtEl)

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="connection-line-group"]').trigger('click')

    expect(wrapper.emitted('delete-requested')).toBeFalsy()
  })

  it('renders no paths when there are no mappings', () => {
    const { wrapper } = mountWithContainers()
    expect(wrapper.findAll('[data-testid="connection-path"]')).toHaveLength(0)
  })

  it('renders one path per mapping after mappings are added', async () => {
    // Attach field elements with matching data attributes so getBoundingClientRect is called
    const srcEl = document.createElement('div')
    srcEl.setAttribute('data-field-id', 'src-1')
    srcEl.setAttribute('data-field-side', 'source')
    document.body.appendChild(srcEl)

    const tgtEl = document.createElement('div')
    tgtEl.setAttribute('data-field-id', 'tgt-1')
    tgtEl.setAttribute('data-field-side', 'target')
    document.body.appendChild(tgtEl)

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-testid="connection-path"]')).toHaveLength(1)
  })

  // Scenario: Hovering a mapping dims all other connection lines
  it('dims all other lines when one mapping line is hovered', async () => {
    for (const [id, side] of [
      ['src-1', 'source'],
      ['tgt-1', 'target'],
      ['src-2', 'source'],
      ['tgt-2', 'target'],
    ] as const) {
      const el = document.createElement('div')
      el.setAttribute('data-field-id', id)
      el.setAttribute('data-field-side', side)
      document.body.appendChild(el)
    }

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const groups = wrapper.findAll('[data-testid="connection-line-group"]')
    expect(groups).toHaveLength(2)

    await groups[0]!.trigger('mouseenter')

    expect(groups[0]!.attributes('data-dimmed')).toBe('false')
    expect(groups[1]!.attributes('data-dimmed')).toBe('true')
  })

  // Scenario: Selecting a mapping dims all other connection lines
  it('dims all other lines when one mapping is selected', async () => {
    for (const [id, side] of [
      ['src-1', 'source'],
      ['tgt-1', 'target'],
      ['src-2', 'source'],
      ['tgt-2', 'target'],
    ] as const) {
      const el = document.createElement('div')
      el.setAttribute('data-field-id', id)
      el.setAttribute('data-field-side', side)
      document.body.appendChild(el)
    }

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })
    store.selectMapping(store.mappings[0]!.id)

    await flushPromises()
    await wrapper.vm.$nextTick()

    const groups = wrapper.findAll('[data-testid="connection-line-group"]')
    expect(groups[0]!.attributes('data-dimmed')).toBe('false')
    expect(groups[1]!.attributes('data-dimmed')).toBe('true')
  })

  // Scenario: Hovering a mapped field highlights its connection line and its mapped counterpart
  it('highlights a line when its source field is hovered via the store', async () => {
    for (const [id, side] of [
      ['src-1', 'source'],
      ['tgt-1', 'target'],
      ['src-2', 'source'],
      ['tgt-2', 'target'],
    ] as const) {
      const el = document.createElement('div')
      el.setAttribute('data-field-id', id)
      el.setAttribute('data-field-side', side)
      document.body.appendChild(el)
    }

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    store.hoverField('src-1', 'source')
    await wrapper.vm.$nextTick()

    const groups = wrapper.findAll('[data-testid="connection-line-group"]')
    expect(groups[0]!.attributes('data-dimmed')).toBe('false')
    expect(groups[1]!.attributes('data-dimmed')).toBe('true')
  })

  // Regression: source and target schemas are parsed independently, so an
  // unrelated source field can share a raw id with the target field being
  // hovered. Found live by Kim — hovering one of two target fields mapped
  // from the same source sometimes also highlighted the *other* mapping's
  // line, whenever that other mapping's source field happened to share an
  // id with the hovered target field.
  it('does not focus an unrelated mapping whose source field id collides with the hovered target field id', async () => {
    for (const [id, side] of [
      ['shared-id', 'source'],
      ['shared-id', 'target'],
      ['shared-id', 'source'],
      ['other-target', 'target'],
    ] as const) {
      const el = document.createElement('div')
      el.setAttribute('data-field-id', id)
      el.setAttribute('data-field-side', side)
      document.body.appendChild(el)
    }

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    // mapping1: source 'shared-id' -> target 'shared-id' (id collision by design)
    store.createMapping({ sourceFieldId: 'shared-id', targetFieldId: 'shared-id' })
    // mapping2: same source 'shared-id' -> a different, unrelated target
    store.createMapping({ sourceFieldId: 'shared-id', targetFieldId: 'other-target' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    // Hover the TARGET field 'shared-id' (mapping1's target).
    store.hoverField('shared-id', 'target')
    await wrapper.vm.$nextTick()

    // lines.value preserves mappings.value order, so groups[0]/[1] match
    // mapping1/mapping2 respectively.
    const groups = wrapper.findAll('[data-testid="connection-line-group"]')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.attributes('data-dimmed')).toBe('false') // mapping1: hovered target itself
    expect(groups[1]!.attributes('data-dimmed')).toBe('true') // mapping2: must stay dimmed
  })

  // Scenario: Clicking one of two closely overlapping connection lines selects exactly one mapping
  it('selects exactly one mapping when one of two overlapping lines is clicked', async () => {
    for (const [id, side] of [
      ['src-1', 'source'],
      ['tgt-1', 'target'],
      ['src-2', 'source'],
      ['tgt-2', 'target'],
    ] as const) {
      const el = document.createElement('div')
      el.setAttribute('data-field-id', id)
      el.setAttribute('data-field-side', side)
      document.body.appendChild(el)
    }

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const groups = wrapper.findAll('[data-testid="connection-line-group"]')
    await groups[1]!.trigger('click')

    expect(store.selectedMappingId).toBe(store.mappings[1]!.id)
    expect(store.selectedMappingId).not.toBe(store.mappings[0]!.id)
  })

  // Scenario: No active mapping shows the normal empty state
  it('dims and highlights nothing when no mapping is selected or hovered', async () => {
    const srcEl = document.createElement('div')
    srcEl.setAttribute('data-field-id', 'src-1')
    srcEl.setAttribute('data-field-side', 'source')
    document.body.appendChild(srcEl)

    const tgtEl = document.createElement('div')
    tgtEl.setAttribute('data-field-id', 'tgt-1')
    tgtEl.setAttribute('data-field-side', 'target')
    document.body.appendChild(tgtEl)

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const group = wrapper.find('[data-testid="connection-line-group"]')
    expect(group.attributes('data-dimmed')).toBe('false')
  })

  // Scenario: A mapping between a collapsed object and an expanded object keeps its line visible
  it('keeps a line visible, anchored at the schema panel edge, when its field is inside a collapsed object but the other side is open', async () => {
    // The panel container (SourceSchemaPanel's root carries data-scroll-container) —
    // the anchor x-coordinate must come from THIS element's edge, not from any
    // individual row/button inside it.
    const panelEl = document.createElement('div')
    panelEl.setAttribute('data-scroll-container', '')
    panelEl.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 300, bottom: 500, width: 300, height: 500 }) as DOMRect
    document.body.appendChild(panelEl)

    // Hidden field: inside a collapsed object, so it reports zero height —
    // exactly what SourceSchemaPanel's real markup produces for a field
    // hidden under `v-show="isFieldExpanded(...)"` when jsdom's layout is
    // (as always) zero anyway.
    const hiddenFieldEl = document.createElement('div')
    hiddenFieldEl.setAttribute('data-field-id', 'adres.straat')
    hiddenFieldEl.setAttribute('data-field-side', 'source')
    hiddenFieldEl.setAttribute('data-field-in-group', 'source:')
    hiddenFieldEl.setAttribute('data-child-of-field', 'source:adres')
    panelEl.appendChild(hiddenFieldEl)

    // The collapsed object's own toggle button — visible, so it's a valid
    // anchor for the hidden field above. Deliberately narrower than the
    // panel (mimics the real bug: a scope checkbox sibling shrinks the
    // flex-1 toggle button short of the panel's true right edge).
    const anchorEl = document.createElement('div')
    anchorEl.setAttribute('data-anchor-field', 'source:adres')
    anchorEl.getBoundingClientRect = () =>
      ({ left: 0, top: 10, right: 200, width: 200, height: 20 }) as DOMRect
    panelEl.appendChild(anchorEl)

    // Target field on an expanded, non-collapsible panel.
    const tgtEl = document.createElement('div')
    tgtEl.setAttribute('data-field-id', 'tgt-1')
    tgtEl.setAttribute('data-field-side', 'target')
    document.body.appendChild(tgtEl)

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'adres.straat', targetFieldId: 'tgt-1' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    const paths = wrapper.findAll('[data-testid="connection-path"]')
    expect(paths).toHaveLength(1)
    // Anchored at the panel's right edge (300), not the narrower button's
    // own right edge (200) — that was the "line overlaps the checkbox" bug.
    expect(paths[0]!.attributes('d')).toMatch(/^M 300 20 /)

    panelEl.remove()
  })

  // Scenario: Collapsing an object replaces its mapped fields' connection lines with a single dot
  it('draws no line but a dot on each side when both endpoints are inside collapsed objects', async () => {
    const sourcePanelEl = document.createElement('div')
    sourcePanelEl.setAttribute('data-scroll-container', '')
    sourcePanelEl.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 300, bottom: 500, width: 300, height: 500 }) as DOMRect
    document.body.appendChild(sourcePanelEl)

    const hiddenSourceEl = document.createElement('div')
    hiddenSourceEl.setAttribute('data-field-id', 'adres.straat')
    hiddenSourceEl.setAttribute('data-field-side', 'source')
    hiddenSourceEl.setAttribute('data-field-in-group', 'source:')
    hiddenSourceEl.setAttribute('data-child-of-field', 'source:adres')
    sourcePanelEl.appendChild(hiddenSourceEl)

    const sourceAnchorEl = document.createElement('div')
    sourceAnchorEl.setAttribute('data-anchor-field', 'source:adres')
    sourceAnchorEl.getBoundingClientRect = () =>
      ({ left: 0, top: 10, right: 200, width: 200, height: 20 }) as DOMRect
    sourcePanelEl.appendChild(sourceAnchorEl)

    const targetPanelEl = document.createElement('div')
    targetPanelEl.setAttribute('data-scroll-container', '')
    targetPanelEl.getBoundingClientRect = () =>
      ({ left: 400, top: 0, right: 700, bottom: 500, width: 300, height: 500 }) as DOMRect
    document.body.appendChild(targetPanelEl)

    const hiddenTargetEl = document.createElement('div')
    hiddenTargetEl.setAttribute('data-field-id', 'contact.email')
    hiddenTargetEl.setAttribute('data-field-side', 'target')
    hiddenTargetEl.setAttribute('data-field-in-group', 'target:')
    hiddenTargetEl.setAttribute('data-child-of-field', 'target:contact')
    targetPanelEl.appendChild(hiddenTargetEl)

    const targetAnchorEl = document.createElement('div')
    targetAnchorEl.setAttribute('data-anchor-field', 'target:contact')
    targetAnchorEl.getBoundingClientRect = () =>
      ({ left: 450, top: 40, right: 650, width: 200, height: 20 }) as DOMRect
    targetPanelEl.appendChild(targetAnchorEl)

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'adres.straat', targetFieldId: 'contact.email' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="connection-path"]')).toHaveLength(0)
    const dots = wrapper.findAll('[data-testid="collapsed-mapping-dot"]')
    expect(dots).toHaveLength(2)
    // Both dots anchored at their respective panel edges.
    expect(dots.some((d) => d.attributes('cx') === '300')).toBe(true)
    expect(dots.some((d) => d.attributes('cx') === '400')).toBe(true)

    sourcePanelEl.remove()
    targetPanelEl.remove()
  })

  // Scenario: Collapsing a top-level object with deeply nested mapped fields shows exactly one dot
  it('shows exactly one dot for a collapsed object even when several of its fields are mapped', async () => {
    const panelEl = document.createElement('div')
    panelEl.setAttribute('data-scroll-container', '')
    panelEl.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 300, bottom: 500, width: 300, height: 500 }) as DOMRect
    document.body.appendChild(panelEl)

    const anchorEl = document.createElement('div')
    anchorEl.setAttribute('data-anchor-field', 'source:adres')
    anchorEl.getBoundingClientRect = () =>
      ({ left: 0, top: 10, right: 200, width: 200, height: 20 }) as DOMRect
    panelEl.appendChild(anchorEl)

    for (const id of ['adres.straat', 'adres.postcode']) {
      const hiddenEl = document.createElement('div')
      hiddenEl.setAttribute('data-field-id', id)
      hiddenEl.setAttribute('data-field-side', 'source')
      hiddenEl.setAttribute('data-field-in-group', 'source:')
      hiddenEl.setAttribute('data-child-of-field', 'source:adres')
      panelEl.appendChild(hiddenEl)
    }

    const targetPanelEl = document.createElement('div')
    targetPanelEl.setAttribute('data-scroll-container', '')
    targetPanelEl.getBoundingClientRect = () =>
      ({ left: 400, top: 0, right: 700, bottom: 500, width: 300, height: 500 }) as DOMRect
    document.body.appendChild(targetPanelEl)

    const targetAnchorEl = document.createElement('div')
    targetAnchorEl.setAttribute('data-anchor-field', 'target:contact')
    targetAnchorEl.getBoundingClientRect = () =>
      ({ left: 450, top: 40, right: 650, width: 200, height: 20 }) as DOMRect
    targetPanelEl.appendChild(targetAnchorEl)

    for (const id of ['contact.email', 'contact.phone']) {
      const hiddenEl = document.createElement('div')
      hiddenEl.setAttribute('data-field-id', id)
      hiddenEl.setAttribute('data-field-side', 'target')
      hiddenEl.setAttribute('data-field-in-group', 'target:')
      hiddenEl.setAttribute('data-child-of-field', 'target:contact')
      targetPanelEl.appendChild(hiddenEl)
    }

    const { wrapper } = mountWithContainers()
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'adres.straat', targetFieldId: 'contact.email' })
    store.createMapping({ sourceFieldId: 'adres.postcode', targetFieldId: 'contact.phone' })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="connection-path"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="collapsed-mapping-dot"]')).toHaveLength(2)

    panelEl.remove()
    targetPanelEl.remove()
  })

  it('attaches a capture scroll listener on the parent and removes it on unmount', () => {
    const addSpy = vi.spyOn(EventTarget.prototype, 'addEventListener')
    const removeSpy = vi.spyOn(EventTarget.prototype, 'removeEventListener')

    const { wrapper } = mountWithContainers()

    const scrollAdded = addSpy.mock.calls.filter(
      ([ev, , opts]) => ev === 'scroll' && (opts as AddEventListenerOptions)?.capture,
    )
    expect(scrollAdded.length).toBeGreaterThan(0)

    wrapper.unmount()

    const scrollRemoved = removeSpy.mock.calls.filter(
      ([ev, , opts]) => ev === 'scroll' && (opts as EventListenerOptions)?.capture,
    )
    expect(scrollRemoved.length).toBeGreaterThan(0)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})

// Task #145 (Feature #127) — temporary trace line for a traced AI suggestion
describe('Suggestion trace line', () => {
  function attachFields(sourceId: string, targetId: string) {
    const srcEl = document.createElement('div')
    srcEl.setAttribute('data-field-id', sourceId)
    srcEl.setAttribute('data-field-side', 'source')
    document.body.appendChild(srcEl)

    const tgtEl = document.createElement('div')
    tgtEl.setAttribute('data-field-id', targetId)
    tgtEl.setAttribute('data-field-side', 'target')
    document.body.appendChild(tgtEl)
  }

  function seedSuggestion(sourceId = 'src-1', targetId = 'tgt-1'): AiSuggestion {
    const suggestion: AiSuggestion = {
      id: 'sug-1',
      sourceFieldId: sourceId,
      targetFieldId: targetId,
      confidenceScore: 0.9,
      reasoning: 'omdat de veldnamen overeenkomen',
      status: 'pending',
    }
    useAISuggestions().suggestions.push(suggestion)
    return suggestion
  }

  it('renders no trace line when no suggestion is traced', () => {
    attachFields('src-1', 'tgt-1')
    const { wrapper } = mountWithContainers()
    seedSuggestion()

    expect(wrapper.find('[data-testid="suggestion-trace-line"]').exists()).toBe(false)
  })

  it('renders a trace line when a suggestion is traced', async () => {
    attachFields('src-1', 'tgt-1')
    const { wrapper } = mountWithContainers()
    const aiStore = useAISuggestions()
    const suggestion = seedSuggestion()

    aiStore.traceSuggestion(suggestion.id)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="suggestion-trace-line"]').exists()).toBe(true)
  })

  it('renders the trace path as dashed and visually distinct from confirmed mappings', async () => {
    attachFields('src-1', 'tgt-1')
    const { wrapper } = mountWithContainers()
    const aiStore = useAISuggestions()
    const suggestion = seedSuggestion()

    aiStore.traceSuggestion(suggestion.id)
    await flushPromises()
    await wrapper.vm.$nextTick()

    const path = wrapper.find('[data-testid="suggestion-trace-path"]')
    expect(path.exists()).toBe(true)
    expect(path.attributes('stroke-dasharray')).toBeTruthy()
    // Confirmed mapping lines are indigo (#6366f1 / #4f46e5); the trace line
    // must use a different hue so the two are never confused at a glance.
    expect(path.attributes('stroke')).not.toBe('#6366f1')
    expect(path.attributes('stroke')).not.toBe('#4f46e5')
  })

  it('removes the trace line when the trace is cleared', async () => {
    attachFields('src-1', 'tgt-1')
    const { wrapper } = mountWithContainers()
    const aiStore = useAISuggestions()
    const suggestion = seedSuggestion()

    aiStore.traceSuggestion(suggestion.id)
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="suggestion-trace-line"]').exists()).toBe(true)

    aiStore.traceSuggestion(suggestion.id) // toggle off
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="suggestion-trace-line"]').exists()).toBe(false)
  })

  it('removes the trace line when the traced suggestion is accepted', async () => {
    attachFields('src-1', 'tgt-1')
    const { wrapper } = mountWithContainers()
    const aiStore = useAISuggestions()
    const suggestion = seedSuggestion()

    aiStore.traceSuggestion(suggestion.id)
    await flushPromises()
    await wrapper.vm.$nextTick()

    aiStore.acceptSuggestion(suggestion.id)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="suggestion-trace-line"]').exists()).toBe(false)
  })

  it('removes the trace line when the traced suggestion is rejected', async () => {
    attachFields('src-1', 'tgt-1')
    const { wrapper } = mountWithContainers()
    const aiStore = useAISuggestions()
    const suggestion = seedSuggestion()

    aiStore.traceSuggestion(suggestion.id)
    await flushPromises()
    await wrapper.vm.$nextTick()

    aiStore.rejectSuggestion(suggestion.id)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="suggestion-trace-line"]').exists()).toBe(false)
  })

  it('only ever renders one trace line at a time (replaces on trace of a different suggestion)', async () => {
    attachFields('src-1', 'tgt-1')
    attachFields('src-2', 'tgt-2')
    const { wrapper } = mountWithContainers()
    const aiStore = useAISuggestions()
    aiStore.suggestions.push({
      id: 'sug-1',
      sourceFieldId: 'src-1',
      targetFieldId: 'tgt-1',
      confidenceScore: 0.9,
      reasoning: 'omdat de veldnamen overeenkomen',
      status: 'pending',
    })
    aiStore.suggestions.push({
      id: 'sug-2',
      sourceFieldId: 'src-2',
      targetFieldId: 'tgt-2',
      confidenceScore: 0.9,
      reasoning: 'ook een goede match',
      status: 'pending',
    })

    aiStore.traceSuggestion('sug-1')
    await flushPromises()
    await wrapper.vm.$nextTick()

    aiStore.traceSuggestion('sug-2')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[data-testid="suggestion-trace-line"]')).toHaveLength(1)
  })
})
