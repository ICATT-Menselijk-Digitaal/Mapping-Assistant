import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, type ComponentPublicInstance } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import SourceSchemaPanel from '../SourceSchemaPanel.vue'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'

// Feature #195: hover lag on large coupling sets came from every field row in
// both panels re-rendering on every hover. These tests pin down the cause:
// a hover may only re-render the rows whose highlight actually changes.
// (The 100 ms target itself is measured in a real browser — see
// test-data/perf/README.md.)

const FIELDS_PER_SIDE = 200

function largeSchema(prefix: string) {
  const nodes: SchemaFieldNode[] = []
  for (let i = 0; i < FIELDS_PER_SIDE; i++) {
    const object = `${prefix}${Math.floor(i / 20)}`
    const path = `${object}.veld${i}`
    nodes.push({ id: path, name: `veld${i}`, path, dataType: 'string', required: false })
  }
  return buildSchema('', nodes)
}

const sourceSchema = largeSchema('Bron')
const targetSchema = largeSchema('Doel')

let rowUpdates = 0
const countRowUpdates = {
  updated(this: ComponentPublicInstance) {
    if (this.$options.__name === 'SchemaFieldRow') rowUpdates++
  },
}

function mountBothPanels(pinia: Pinia) {
  const global = { plugins: [pinia], mixins: [countRowUpdates] }
  const source = mount(SourceSchemaPanel, {
    global,
    props: { schema: sourceSchema, side: 'source' },
  })
  const target = mount(SourceSchemaPanel, {
    global,
    props: { schema: targetSchema, side: 'target' },
  })
  return { source, target }
}

function sourceId(i: number) {
  return `Bron${Math.floor(i / 20)}.veld${i}`
}
function targetId(i: number) {
  return `Doel${Math.floor(i / 20)}.veld${i}`
}

describe('field hover on a large coupling set', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    rowUpdates = 0
  })

  // Scenario: Hovering a field on a large coupling set shows its highlight without lag
  it('re-renders only the hovered row and its coupled counterpart', async () => {
    const { source } = mountBothPanels(pinia)
    const store = useMappings()
    for (let i = 0; i < FIELDS_PER_SIDE; i++) {
      store.createMapping({ sourceFieldId: sourceId(i), targetFieldId: targetId(i) })
    }
    await nextTick()
    rowUpdates = 0

    await source.find(`[data-field-id="${sourceId(42)}"]`).trigger('mouseenter')
    await nextTick()

    expect(rowUpdates).toBe(2)
  })

  // Scenario: Hovering a field with many couplings stays responsive
  it('re-renders only the hovered row and its coupled rows when one field has many couplings', async () => {
    const { source } = mountBothPanels(pinia)
    const store = useMappings()
    for (let i = 0; i < 60; i++) {
      store.createMapping({ sourceFieldId: sourceId(0), targetFieldId: targetId(i) })
    }
    await nextTick()
    rowUpdates = 0

    await source.find(`[data-field-id="${sourceId(0)}"]`).trigger('mouseenter')
    await nextTick()

    expect(rowUpdates).toBe(1 + 60)
  })
})
