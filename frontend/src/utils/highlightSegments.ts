export interface TextSegment {
  text: string
  highlight: boolean
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
