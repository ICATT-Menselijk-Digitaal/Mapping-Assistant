export interface TextSegment {
  text: string
  highlight: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function highlightHtml(text: string, query: string, markClass: string): string {
  return highlightSegments(text, query)
    .map((seg) =>
      seg.highlight
        ? `<mark class="${markClass}">${escapeHtml(seg.text)}</mark>`
        : escapeHtml(seg.text),
    )
    .join('')
}

export function highlightPathSegments(path: string, query: string, markClass: string): string[] {
  const segments = path.split('.')
  if (!query) return segments.map(escapeHtml)

  const lowerPath = path.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const matchRanges: [number, number][] = []
  let cursor = 0
  while (cursor < path.length) {
    const idx = lowerPath.indexOf(lowerQuery, cursor)
    if (idx === -1) break
    matchRanges.push([idx, idx + query.length])
    cursor = idx + query.length
  }

  let offset = 0
  return segments.map((seg) => {
    const segStart = offset
    const segEnd = offset + seg.length
    offset = segEnd + 1

    const parts: string[] = []
    let segCursor = 0
    for (const [matchStart, matchEnd] of matchRanges) {
      const overlapStart = Math.max(matchStart, segStart) - segStart
      const overlapEnd = Math.min(matchEnd, segEnd) - segStart
      if (overlapStart >= overlapEnd) continue
      if (overlapStart > segCursor) {
        parts.push(escapeHtml(seg.slice(segCursor, overlapStart)))
      }
      parts.push(
        `<mark class="${markClass}">${escapeHtml(seg.slice(overlapStart, overlapEnd))}</mark>`,
      )
      segCursor = overlapEnd
    }
    if (segCursor < seg.length || parts.length === 0) {
      parts.push(escapeHtml(seg.slice(segCursor)))
    }
    return parts.join('')
  })
}

export function highlightSegments(text: string, query: string): TextSegment[] {
  if (!query) return [{ text, highlight: false }]

  const segments: TextSegment[] = []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let cursor = 0

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor)
    if (matchIndex === -1) {
      segments.push({ text: text.slice(cursor), highlight: false })
      break
    }
    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), highlight: false })
    }
    segments.push({ text: text.slice(matchIndex, matchIndex + query.length), highlight: true })
    cursor = matchIndex + query.length
  }

  return segments
}
