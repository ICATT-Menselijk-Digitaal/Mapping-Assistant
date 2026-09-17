import { describe, it, expect } from 'vitest'
import { parseOpenApiSchema } from '../openApiParser'

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

  // Bug #151: nullable object refs via anyOf/oneOf/allOf were shown as
  // unknown type with no children, breaking suggestion navigation into them.
  describe('composition keywords (allOf/anyOf/oneOf)', () => {
    const composedSpec = (compose: 'anyOf' | 'oneOf') => ({
      openapi: '3.1.0',
      components: {
        schemas: {
          Zaak: {
            type: 'object',
            properties: {
              betrokkene: {
                [compose]: [{ $ref: '#/components/schemas/Betrokkene' }, { type: 'null' }],
              },
            },
          },
          Betrokkene: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      },
    })

    it('resolves a nullable $ref via anyOf into an expandable object field', () => {
      const schema = parseOpenApiSchema(composedSpec('anyOf'))
      const betrokkene = schema.all().find((f) => f.name === 'betrokkene')
      expect(betrokkene?.dataType).toBe('object')
      const children = schema.childrenOf(betrokkene!.id)
      expect(children.find((c) => c.name === 'name')).toBeDefined()
    })

    it('resolves a nullable $ref via oneOf into an expandable object field', () => {
      const schema = parseOpenApiSchema(composedSpec('oneOf'))
      const betrokkene = schema.all().find((f) => f.name === 'betrokkene')
      expect(betrokkene?.dataType).toBe('object')
      const children = schema.childrenOf(betrokkene!.id)
      expect(children.find((c) => c.name === 'name')).toBeDefined()
    })

    it('merges allOf branches into one expandable object field', () => {
      const spec = {
        openapi: '3.1.0',
        components: {
          schemas: {
            Zaak: {
              type: 'object',
              properties: {
                betrokkene: {
                  allOf: [
                    { $ref: '#/components/schemas/BasisBetrokkene' },
                    { properties: { role: { type: 'string' } } },
                  ],
                },
              },
            },
            BasisBetrokkene: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
            },
          },
        },
      }
      const schema = parseOpenApiSchema(spec)
      const betrokkene = schema.all().find((f) => f.name === 'betrokkene')
      expect(betrokkene?.dataType).toBe('object')
      const children = schema.childrenOf(betrokkene!.id)
      expect(children.find((c) => c.name === 'name')).toBeDefined()
      expect(children.find((c) => c.name === 'role')).toBeDefined()
    })

    // Live bug found while testing this fix: a self-referencing field (e.g.
    // Document.vorigeVersie -> Document via anyOf/$ref, a common
    // audit-trail/version-history shape) recursed forever building the tree,
    // crashing with "Maximum call stack size exceeded".
    it('stops at a repeated $ref instead of recursing forever on a self-referencing field', () => {
      const spec = {
        openapi: '3.1.0',
        components: {
          schemas: {
            Document: {
              type: 'object',
              properties: {
                titel: { type: 'string' },
                vorigeVersie: {
                  anyOf: [{ $ref: '#/components/schemas/Document' }, { type: 'null' }],
                },
              },
            },
          },
        },
      }

      const schema = parseOpenApiSchema(spec)
      const vorigeVersie = schema.all().find((f) => f.name === 'vorigeVersie')
      expect(vorigeVersie?.dataType).toBe('object')
      const children = schema.childrenOf(vorigeVersie!.id)
      const nestedVorigeVersie = children.find((c) => c.name === 'vorigeVersie')
      expect(nestedVorigeVersie?.dataType).toBe('object')
      expect(schema.childrenOf(nestedVorigeVersie!.id)).toHaveLength(0)
    })

    // Two schemas that reference each other indirectly (Document -> Wijziging
    // -> Document) must be caught the same way as direct self-reference.
    it('stops at a repeated $ref in a mutual A -> B -> A cycle', () => {
      const spec = {
        openapi: '3.1.0',
        components: {
          schemas: {
            Document: {
              type: 'object',
              properties: {
                laatsteWijziging: { $ref: '#/components/schemas/Wijziging' },
              },
            },
            Wijziging: {
              type: 'object',
              properties: {
                document: {
                  anyOf: [{ $ref: '#/components/schemas/Document' }, { type: 'null' }],
                },
              },
            },
          },
        },
      }

      const schema = parseOpenApiSchema(spec)
      const laatsteWijziging = schema.all().find((f) => f.name === 'laatsteWijziging')
      const wijzigingChildren = schema.childrenOf(laatsteWijziging!.id)
      const document = wijzigingChildren.find((c) => c.name === 'document')
      expect(document?.dataType).toBe('object')

      // `document` (Document, 2nd occurrence) still resolves its own
      // properties, since only "Wijziging" has been seen twice at this
      // point, not "Document" yet. The cutoff lands one level further down,
      // at the next repeated name ("Wijziging" again) — this asserts the
      // walk terminates there rather than recursing forever.
      const documentChildren = schema.childrenOf(document!.id)
      const nestedLaatsteWijziging = documentChildren.find((c) => c.name === 'laatsteWijziging')
      expect(nestedLaatsteWijziging?.dataType).toBe('object')
      expect(schema.childrenOf(nestedLaatsteWijziging!.id)).toHaveLength(0)
    })

    // Live bug found while testing the cycle fix above, using e-Suite's real
    // spec: a discriminator pattern (a base schema offers itself via oneOf,
    // and each option reaches back to the base via allOf to inherit its
    // shared fields) was wrongly treated as the same kind of cycle as a
    // genuine self-reference, wiping out the base's fields entirely.
    it('resolves a discriminated oneOf/allOf pattern without losing the base schema fields', () => {
      const spec = {
        openapi: '3.1.0',
        components: {
          schemas: {
            Zaak: {
              type: 'object',
              properties: {
                betrokkene: { $ref: '#/components/schemas/Subject' },
              },
            },
            Subject: {
              type: 'object',
              required: ['identifier'],
              oneOf: [
                { $ref: '#/components/schemas/Persoon' },
                { $ref: '#/components/schemas/Bedrijf' },
              ],
              properties: {
                identifier: { type: 'integer' },
              },
            },
            Persoon: {
              type: 'object',
              required: ['voorletters'],
              allOf: [{ $ref: '#/components/schemas/Subject' }],
              properties: {
                voorletters: { type: 'string' },
              },
            },
            Bedrijf: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/Subject' }],
              properties: {
                kvkNummer: { type: 'string' },
              },
            },
          },
        },
      }

      const schema = parseOpenApiSchema(spec)
      const betrokkene = schema.all().find((f) => f.name === 'betrokkene')
      expect(betrokkene?.dataType).toBe('object')
      const children = schema.childrenOf(betrokkene!.id)
      // Persoon's own field, plus Subject's base field inherited via allOf —
      // neither should be lost.
      expect(children.find((c) => c.name === 'voorletters')).toBeDefined()
      expect(children.find((c) => c.name === 'identifier')).toBeDefined()
    })
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
