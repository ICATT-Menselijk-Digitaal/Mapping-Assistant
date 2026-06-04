import { describe, it, expect } from 'vitest'
import { parseOpenApiSchema, parseOpenApiEndpoints } from '../openApiParser'

const minimalOpenApi3 = {
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0' },
  components: {
    schemas: {
      Zaak: {
        type: 'object',
        required: ['zaakId'],
        properties: {
          zaakId: { type: 'string', description: 'Unique ID' },
          omschrijving: { type: 'string' },
          prioriteit: { type: 'integer' },
          actief: { type: 'boolean' },
          startDatum: { type: 'string', format: 'date' },
          metadata: { type: 'object' },
          tags: { type: 'array' },
        },
      },
    },
  },
}

const swagger2Spec = {
  swagger: '2.0',
  info: { title: 'Test', version: '1.0' },
  definitions: {
    Item: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
}

describe('parseOpenApiSchema', () => {
  // Scenario: Load valid JSON spec via file
  it('parses OpenAPI 3.x components.schemas into a Schema', () => {
    const schema = parseOpenApiSchema(minimalOpenApi3)
    expect(schema.all().length).toBeGreaterThan(0)
    const zaakId = schema.all().find((f) => f.name === 'zaakId')
    expect(zaakId).toBeDefined()
    expect(zaakId?.dataType).toBe('string')
    expect(zaakId?.required).toBe(true)
    expect(zaakId?.description).toBe('Unique ID')
  })

  it('parses Swagger 2.x definitions into a Schema', () => {
    const schema = parseOpenApiSchema(swagger2Spec)
    expect(schema.all()).toHaveLength(2)
    expect(schema.all().find((f) => f.name === 'id')?.required).toBe(true)
    expect(schema.all().find((f) => f.name === 'name')?.required).toBe(false)
  })

  it('maps integer to number dataType', () => {
    const schema = parseOpenApiSchema(minimalOpenApi3)
    expect(schema.all().find((f) => f.name === 'prioriteit')?.dataType).toBe('number')
  })

  it('maps boolean dataType', () => {
    const schema = parseOpenApiSchema(minimalOpenApi3)
    expect(schema.all().find((f) => f.name === 'actief')?.dataType).toBe('boolean')
  })

  it('maps string with format:date to date dataType', () => {
    const schema = parseOpenApiSchema(minimalOpenApi3)
    expect(schema.all().find((f) => f.name === 'startDatum')?.dataType).toBe('date')
  })

  it('maps object and array dataTypes', () => {
    const schema = parseOpenApiSchema(minimalOpenApi3)
    expect(schema.all().find((f) => f.name === 'metadata')?.dataType).toBe('object')
    expect(schema.all().find((f) => f.name === 'tags')?.dataType).toBe('array')
  })

  it('produces unique ids for each field', () => {
    const schema = parseOpenApiSchema(minimalOpenApi3)
    const ids = schema.all().map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('extracts the schema name from spec.info.title', () => {
    const schema = parseOpenApiSchema(minimalOpenApi3)
    expect(schema.name).toBe('Test')
  })

  // Scenario: Empty spec without schema objects
  it('returns an empty schema when spec has no schemas', () => {
    const schema = parseOpenApiSchema({ openapi: '3.0.0', components: { schemas: {} } })
    expect(schema.all()).toHaveLength(0)
    expect(schema.roots).toHaveLength(0)
  })

  // Scenario: Invalid spec selected
  it('throws on null input', () => {
    expect(() => parseOpenApiSchema(null)).toThrow('Invalid spec')
  })

  it('throws on non-object input', () => {
    expect(() => parseOpenApiSchema('not an object')).toThrow('Invalid spec')
  })

  it('throws when spec is valid JSON but not an OpenAPI/Swagger document', () => {
    expect(() => parseOpenApiSchema({ foo: 'bar', data: [1, 2, 3] })).toThrow('openapi')
  })

  // Scenario: Display nested $ref structure
  it('resolves $ref properties into queryable children on the parent field', () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Zaak: {
            type: 'object',
            properties: {
              adres: { $ref: '#/components/schemas/Adres' },
            },
          },
          Adres: {
            type: 'object',
            properties: {
              straat: { type: 'string' },
              huisnummer: { type: 'integer' },
            },
          },
        },
      },
    }
    const schema = parseOpenApiSchema(spec)
    const adres = schema.all().find((f) => f.name === 'adres')
    expect(adres).toBeDefined()
    expect(adres?.dataType).toBe('object')
    const adresChildren = schema.childrenOf(adres!.id)
    expect(adresChildren).toHaveLength(2)
    expect(adresChildren.find((c) => c.name === 'straat')?.dataType).toBe('string')
  })

  it('resolves array items with $ref into queryable children', () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Order: {
            type: 'object',
            properties: {
              lines: {
                type: 'array',
                items: { $ref: '#/components/schemas/OrderLine' },
              },
            },
          },
          OrderLine: {
            type: 'object',
            properties: {
              product: { type: 'string' },
              quantity: { type: 'integer' },
            },
          },
        },
      },
    }
    const schema = parseOpenApiSchema(spec)
    const lines = schema.all().find((f) => f.name === 'lines')
    expect(lines?.dataType).toBe('array')
    const linesChildren = schema.childrenOf(lines!.id)
    expect(linesChildren).toHaveLength(2)
    expect(linesChildren.find((c) => c.name === 'product')).toBeDefined()
  })

  it('resolves inline array items with object properties into queryable children', () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Invoice: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string' },
                    price: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    }
    const schema = parseOpenApiSchema(spec)
    const items = schema.all().find((f) => f.name === 'items')
    expect(items?.dataType).toBe('array')
    const itemsChildren = schema.childrenOf(items!.id)
    expect(itemsChildren).toHaveLength(2)
    expect(itemsChildren.find((c) => c.name === 'sku')).toBeDefined()
  })

  it('resolves inline object properties into queryable children', () => {
    const spec = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Item: {
            type: 'object',
            properties: {
              meta: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
        },
      },
    }
    const schema = parseOpenApiSchema(spec)
    const meta = schema.all().find((f) => f.name === 'meta')
    const metaChildren = schema.childrenOf(meta!.id)
    expect(metaChildren).toHaveLength(2)
    expect(metaChildren.find((c) => c.name === 'key')).toBeDefined()
  })
})

describe('parseOpenApiEndpoints', () => {
  const multiPathSpec = {
    openapi: '3.0.0',
    info: { title: 'Test', version: '1.0' },
    paths: {
      '/zaken': {
        get: {
          operationId: 'listZaken',
          summary: 'List zaken',
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Zaak' },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createZaak',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Zaak' },
              },
            },
          },
          responses: { '201': {} },
        },
      },
      '/zaken/{id}': {
        put: {
          operationId: 'updateZaak',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Zaak' },
              },
            },
          },
          responses: { '200': {} },
        },
      },
    },
    components: {
      schemas: {
        Zaak: {
          type: 'object',
          required: ['zaakId'],
          properties: {
            zaakId: { type: 'string' },
            omschrijving: { type: 'string' },
          },
        },
      },
    },
  }

  // Scenario: Endpoints from a parsed spec are grouped by resource
  it('returns one endpoint per operation in the spec', () => {
    const endpoints = parseOpenApiEndpoints(multiPathSpec)
    expect(endpoints).toHaveLength(3)
    const methods = endpoints.map((e) => e.method)
    expect(methods).toContain('get')
    expect(methods).toContain('post')
    expect(methods).toContain('put')
  })

  it('each endpoint carries its path and method', () => {
    const endpoints = parseOpenApiEndpoints(multiPathSpec)
    const get = endpoints.find((e) => e.method === 'get')
    expect(get?.path).toBe('/zaken')
    const put = endpoints.find((e) => e.method === 'put')
    expect(put?.path).toBe('/zaken/{id}')
  })

  it('includes operationId and summary when present', () => {
    const endpoints = parseOpenApiEndpoints(multiPathSpec)
    const get = endpoints.find((e) => e.method === 'get')
    expect(get?.operationId).toBe('listZaken')
    expect(get?.summary).toBe('List zaken')
  })

  // Scenario: Fields are derived depth-first from an endpoint's schema
  it('fields use dot-notation paths rooted at the response schema', () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/items': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        address: {
                          type: 'object',
                          properties: {
                            street: { type: 'string' },
                            city: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    }
    const endpoints = parseOpenApiEndpoints(spec)
    expect(endpoints).toHaveLength(1)
    const schema = endpoints[0].schema
    expect(schema.all().find((f) => f.path === 'name')).toBeDefined()
    expect(schema.all().find((f) => f.path === 'address')).toBeDefined()
    expect(schema.all().find((f) => f.path === 'address.street')).toBeDefined()
    expect(schema.all().find((f) => f.path === 'address.city')).toBeDefined()
  })

  // Scenario: allOf properties are merged into the parent field level
  it('merges allOf properties into the parent level', () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/items': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      allOf: [
                        {
                          type: 'object',
                          properties: { id: { type: 'string' } },
                        },
                        {
                          type: 'object',
                          properties: { name: { type: 'string' } },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    }
    const endpoints = parseOpenApiEndpoints(spec)
    const schema = endpoints[0].schema
    expect(schema.all().find((f) => f.name === 'id')).toBeDefined()
    expect(schema.all().find((f) => f.name === 'name')).toBeDefined()
  })

  // Scenario: Circular schema references do not cause infinite traversal
  it('handles circular $ref without infinite recursion', () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/items': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Node' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              child: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    }
    expect(() => parseOpenApiEndpoints(spec)).not.toThrow()
    const endpoints = parseOpenApiEndpoints(spec)
    expect(endpoints).toHaveLength(1)
    const schema = endpoints[0].schema
    expect(schema.all().find((f) => f.name === 'value')).toBeDefined()
  })

  // Scenario: Deeply nested schemas are capped at the depth limit
  it('caps field traversal at the depth limit', () => {
    function makeNested(depth: number): Record<string, unknown> {
      if (depth === 0) return { type: 'string' }
      return { type: 'object', properties: { nested: makeNested(depth - 1) } }
    }
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/deep': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': { schema: makeNested(15) },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    }
    const endpoints = parseOpenApiEndpoints(spec)
    const schema = endpoints[0].schema
    const allFields = schema.all()
    const tooDeep = allFields.find((f) => (f.path.match(/\./g) ?? []).length >= 10)
    expect(tooDeep).toBeUndefined()
  })

  // Scenario: POST and PUT operations are available separately as target endpoints
  it('returns POST and PUT as distinct endpoints with their own field trees', () => {
    const endpoints = parseOpenApiEndpoints(multiPathSpec)
    const post = endpoints.find((e) => e.method === 'post' && e.path === '/zaken')
    const put = endpoints.find((e) => e.method === 'put' && e.path === '/zaken/{id}')
    expect(post).toBeDefined()
    expect(put).toBeDefined()
    expect(post?.schema.all().find((f) => f.name === 'zaakId')).toBeDefined()
    expect(put?.schema.all().find((f) => f.name === 'zaakId')).toBeDefined()
  })

  it('returns an empty array for a spec without paths', () => {
    const spec = { openapi: '3.0.0', components: { schemas: {} } }
    expect(parseOpenApiEndpoints(spec)).toHaveLength(0)
  })

  it('returns empty schema for an operation with no response body', () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/items': {
          get: {
            responses: { '200': {} },
          },
        },
      },
      components: { schemas: {} },
    }
    const endpoints = parseOpenApiEndpoints(spec)
    expect(endpoints).toHaveLength(1)
    expect(endpoints[0].schema.all()).toHaveLength(0)
  })
})
