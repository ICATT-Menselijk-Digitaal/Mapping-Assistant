import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadAsJson } from '../downloadHelper'

describe('downloadAsJson', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn<(blob: Blob) => string>>
  let revokeObjectURLMock: ReturnType<typeof vi.fn<(url: string) => void>>
  let clickMock: ReturnType<typeof vi.fn<() => void>>
  let anchorElement: { href: string; download: string; click: ReturnType<typeof vi.fn<() => void>> }

  beforeEach(() => {
    createObjectURLMock = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:fake-url')
    revokeObjectURLMock = vi.fn<(url: string) => void>()
    clickMock = vi.fn<() => void>()

    anchorElement = { href: '', download: '', click: clickMock }

    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    })
    vi.spyOn(document, 'createElement').mockReturnValue(anchorElement as unknown as HTMLElement)
    vi.spyOn(document.body, 'appendChild').mockReturnValue(anchorElement as unknown as Node)
    vi.spyOn(document.body, 'removeChild').mockReturnValue(anchorElement as unknown as Node)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Scenario: Administrator downloads the mapping set as JSON file
  it('creates a blob from the data and triggers a download', () => {
    const data = {
      version: '1.0',
      sourceSchema: { name: 'src', fields: [] },
      targetSchema: { name: 'tgt', fields: [] },
      fieldMappings: [{ sourceField: 'a', targetField: 'b' }],
    }

    downloadAsJson(data, 'koppelingsset-2026-05-26.json')

    expect(createObjectURLMock).toHaveBeenCalledOnce()
    const blob = createObjectURLMock.mock.calls[0]![0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')

    expect(anchorElement.href).toBe('blob:fake-url')
    expect(anchorElement.download).toBe('koppelingsset-2026-05-26.json')
    expect(clickMock).toHaveBeenCalledOnce()
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:fake-url')
  })

  it('serialises the data as valid JSON in the blob', async () => {
    const data = { version: '1.0', fieldMappings: [] }
    let capturedBlob: Blob | undefined

    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b
      return 'blob:fake-url'
    })

    downloadAsJson(data, 'test.json')

    const text = await capturedBlob!.text()
    expect(JSON.parse(text)).toEqual(data)
  })

  // Scenario: Export button available without mappings
  it('triggers download with empty fieldMappings without error', () => {
    const data = {
      version: '1.0',
      sourceSchema: { name: 'src', fields: [] },
      targetSchema: { name: 'tgt', fields: [] },
      fieldMappings: [],
    }

    expect(() => downloadAsJson(data, 'koppelingsset-2026-05-26.json')).not.toThrow('')
    expect(clickMock).toHaveBeenCalledOnce()
  })
})
