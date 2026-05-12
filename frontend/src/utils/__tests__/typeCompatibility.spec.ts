import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { isTypeCompatible } from '../typeCompatibility'
import { useTransformationSuggestions } from '@/composables/useTransformationSuggestions'
import type { SchemaField } from '@/types'

function field(dataType: SchemaField['dataType']): SchemaField {
  return { id: crypto.randomUUID(), name: 'field', path: 'field', dataType, required: false }
}

describe('isTypeCompatible', () => {
  it('incompatible types (string → number) return false', () => {
    expect(isTypeCompatible(field('string'), field('number'))).toBe(false)
  })

  it('compatible types (string → string) return true', () => {
    expect(isTypeCompatible(field('string'), field('string'))).toBe(true)
  })

  it('unknown source type returns false', () => {
    expect(isTypeCompatible(field('unknown'), field('string'))).toBe(false)
  })

  it('unknown target type returns false', () => {
    expect(isTypeCompatible(field('string'), field('unknown'))).toBe(false)
  })

  it('date → string returns false', () => {
    expect(isTypeCompatible(field('date'), field('string'))).toBe(false)
  })
})

describe('useTransformationSuggestions — handleMappingCreated', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('incompatible types trigger a TransformationSuggestionRequested', () => {
    const store = useTransformationSuggestions()
    const src = field('string')
    const tgt = field('number')
    store.handleMappingCreated('m1', src, tgt)
    expect(store.pendingRequests).toHaveLength(1)
    expect(store.pendingRequests[0]).toMatchObject({ mappingId: 'm1', sourceField: src, targetField: tgt })
  })

  it('compatible types produce no TransformationSuggestionRequested', () => {
    const store = useTransformationSuggestions()
    store.handleMappingCreated('m1', field('string'), field('string'))
    expect(store.pendingRequests).toHaveLength(0)
  })

  it('unknown type on either side triggers a request', () => {
    const store = useTransformationSuggestions()
    store.handleMappingCreated('m1', field('unknown'), field('string'))
    expect(store.pendingRequests).toHaveLength(1)
  })

  it('date and string are treated as incompatible', () => {
    const store = useTransformationSuggestions()
    store.handleMappingCreated('m1', field('date'), field('string'))
    expect(store.pendingRequests).toHaveLength(1)
  })
})
