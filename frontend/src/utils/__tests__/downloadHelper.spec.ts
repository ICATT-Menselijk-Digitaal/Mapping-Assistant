import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadAsJson } from '../downloadHelper'

describe('downloadAsJson', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let clickMock: ReturnType<typeof vi.fn>
  let appendChildMock: ReturnType<typeof vi.fn>
  let removeChildMock: ReturnType<typeof vi.fn>
  let anchorElement: { href: string; download: string; click: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:fake-url')
    revokeObjectURLMock = vi.fn()
    clickMock = vi.fn()
    appendChildMock = vi.fn()
    removeChildMock = vi.fn()

    anchorElement = { href: '', download: '', click: clickMock }

    vi.stubGlobal('URL', { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock })
    vi.spyOn(document, 'createElement').mockReturnValue(anchorElement as unknown as HTMLElement)
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock)
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Scenario: Administrator downloads the mapping set as JSON file
  it('creates a blob from the data and triggers a download', () => {
    const data = { version: '1.0', sourceSchema: { name: 'src', fields: [] }, targetSchema: { name: 'tgt', fields: [] }, fieldMappings: [{ sourceField: 'a', targetField: 'b' }] }

    downloadAsJson(data, 'koppelingsset-2026-05-26.json')

    expect(createObjectURLMock).toHaveBeenCalledOnce()
    const blob: Blob = createObjectURLMock.mock.calls[0][0]
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
    const data = { version: '1.0', sourceSchema: { name: 'src', fields: [] }, targetSchema: { name: 'tgt', fields: [] }, fieldMappings: [] }

    expect(() => downloadAsJson(data, 'koppelingsset-2026-05-26.json')).not.toThrow()
    expect(clickMock).toHaveBeenCalledOnce()
  })
})
