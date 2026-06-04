import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSourceSchema } from '../useSourceSchema'

const validYaml = `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Zaak:
      type: object
      required:
        - zaakId
      properties:
        zaakId:
          type: string
        omschrijving:
          type: string
`

const validJson = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0' },
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
})

function makeFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/plain' })
}

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSourceSchema', () => {
  // Scenario: Load valid YAML spec via file
  it('loads and parses a valid YAML file', async () => {
    const { schema, error, loadFromFile } = useSourceSchema()
    await loadFromFile(makeFile(validYaml, 'spec.yaml'))

    expect(error.value).toBeNull()
    expect(schema.value.all().length).toBeGreaterThan(0)
    expect(schema.value.all().find((f) => f.name === 'zaakId')?.required).toBe(true)
  })

  // Scenario: Load valid JSON spec via file
  it('loads and parses a valid JSON file', async () => {
    const { schema, error, loadFromFile } = useSourceSchema()
    await loadFromFile(makeFile(validJson, 'spec.json'))

    expect(error.value).toBeNull()
    expect(schema.value.all().length).toBeGreaterThan(0)
  })

  // Scenario: Invalid spec selected
  it('sets error when file content is not a valid OpenAPI spec', async () => {
    const { schema, error, loadFromFile } = useSourceSchema()
    await loadFromFile(makeFile('not: valid: yaml: {{{', 'bad.yaml'))

    expect(error.value).not.toBeNull()
    expect(schema.value.all()).toHaveLength(0)
  })

  // Scenario: Empty spec without schema objects
  it('sets empty fields (no error) when spec has no schema objects', async () => {
    const emptySpec = JSON.stringify({ openapi: '3.0.0', components: { schemas: {} } })
    const { schema, error, loadFromFile } = useSourceSchema()
    await loadFromFile(makeFile(emptySpec, 'empty.json'))

    expect(error.value).toBeNull()
    expect(schema.value.all()).toHaveLength(0)
  })

  // Scenario: Load spec via URL
  it('fetches and parses a spec from a URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(validJson),
    }))

    const { schema, error, loadFromUrl } = useSourceSchema()
    await loadFromUrl('https://example.com/api-docs.json')

    expect(error.value).toBeNull()
    expect(schema.value.all().length).toBeGreaterThan(0)
  })

  // Scenario: URL unreachable
  it('sets error when URL fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))

    const { schema, error, loadFromUrl } = useSourceSchema()
    await loadFromUrl('https://example.com/not-found.json')

    expect(error.value).not.toBeNull()
    expect(schema.value.all()).toHaveLength(0)
  })

  it('sets error when fetch throws (network unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { schema, error, loadFromUrl } = useSourceSchema()
    await loadFromUrl('https://unreachable.example.com/')

    expect(error.value).not.toBeNull()
    expect(schema.value.all()).toHaveLength(0)
  })

  it('exposes the schema name from the spec title', async () => {
    const { schema, loadFromFile } = useSourceSchema()
    await loadFromFile(makeFile(validJson, 'spec.json'))

    expect(schema.value.name).toBe('Test')
  })

  it('records the source URL when loaded from URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(validJson),
    }))

    const { sourceUrl, loadFromUrl } = useSourceSchema()
    await loadFromUrl('https://example.com/api-docs.json')

    expect(sourceUrl.value).toBe('https://example.com/api-docs.json')
  })

  it('clears the source URL when loaded from file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(validJson),
    }))

    const { sourceUrl, loadFromUrl, loadFromFile } = useSourceSchema()
    await loadFromUrl('https://example.com/api-docs.json')
    expect(sourceUrl.value).toBe('https://example.com/api-docs.json')

    await loadFromFile(makeFile(validJson, 'spec.json'))
    expect(sourceUrl.value).toBeNull()
  })

  it('clears the source URL when URL load fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const { sourceUrl, loadFromUrl } = useSourceSchema()
    await loadFromUrl('https://example.com/missing.json')

    expect(sourceUrl.value).toBeNull()
  })
})
