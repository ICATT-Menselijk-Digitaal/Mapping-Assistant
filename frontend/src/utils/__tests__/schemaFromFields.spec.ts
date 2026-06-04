import { describe, it, expect } from 'vitest'
import { buildSchemaFromFields } from '../schemaFromFields'
import type { SchemaField } from '@/types'

describe('buildSchemaFromFields', () => {
  it('rebuilds a flat schema from a one-level field list', () => {
    const fields: SchemaField[] = [
      { id: 'customerId', name: 'customerId', path: 'customerId', dataType: 'string', required: true },
      { id: 'name', name: 'name', path: 'name', dataType: 'string', required: false },
    ]
    const schema = buildSchemaFromFields('Source', fields)

    expect(schema.name).toBe('Source')
    expect(schema.all()).toHaveLength(2)
    expect(schema.byId('customerId')?.required).toBe(true)
    expect(schema.roots).toHaveLength(2)
  })

  it('reconstructs parent/child relationships from dot-paths', () => {
    const fields: SchemaField[] = [
      { id: 'address', name: 'address', path: 'address', dataType: 'object', required: false },
      { id: 'address.city', name: 'city', path: 'address.city', dataType: 'string', required: false },
      { id: 'address.street', name: 'street', path: 'address.street', dataType: 'string', required: false },
    ]
    const schema = buildSchemaFromFields('Address', fields)

    expect(schema.roots).toHaveLength(1)
    expect(schema.roots[0]!.id).toBe('address')
    expect(schema.childrenOf('address').map((c) => c.id)).toEqual(['address.city', 'address.street'])
    expect(schema.parentOf('address.city')?.id).toBe('address')
  })

  it('returns an empty schema when the field list is empty', () => {
    const schema = buildSchemaFromFields('Empty', [])
    expect(schema.all()).toHaveLength(0)
    expect(schema.name).toBe('Empty')
  })
})
