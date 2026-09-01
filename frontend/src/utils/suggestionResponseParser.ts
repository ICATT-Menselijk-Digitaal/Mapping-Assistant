export interface ClaudeApiSuggestion {
  sourceField: string
  targetField: string
  confidenceScore: number
  reasoning: string
}

/**
 * Recover a `suggestions` array from a Claude / OpenRouter response that may
 * have been cut off mid-object because `max_tokens` was hit. Tries a strict
 * `JSON.parse` first; if that fails, scans for the `"suggestions"` key, walks
 * the array, and returns whatever complete `{ ... }` objects can be parsed
 * before the truncation point.
 *
 * Returns:
 *   - `[]`   — the array was found but yielded no usable objects (e.g. AI
 *              explicitly reported no matches). A legitimate outcome, not an
 *              error.
 *   - `null` — no `"suggestions"` array could be located in the response. The
 *              caller should treat this as an unparseable response.
 */
export function extractSuggestions(raw: string): ClaudeApiSuggestion[] | null {
  try {
    const parsed = JSON.parse(raw) as { suggestions?: ClaudeApiSuggestion[] }
    if (Array.isArray(parsed.suggestions)) return parsed.suggestions
  } catch {
    // fall through to lenient scan
  }

  const arrStart = raw.indexOf('"suggestions"')
  const bracket = arrStart === -1 ? -1 : raw.indexOf('[', arrStart)
  if (bracket === -1) return null

  const out: ClaudeApiSuggestion[] = []
  let depth = 0
  let objStart = -1
  let inString = false
  let escape = false
  for (let i = bracket + 1; i < raw.length; i++) {
    const c = raw[i]!
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(raw.slice(objStart, i + 1)) as ClaudeApiSuggestion)
        } catch {
          // skip malformed object
        }
        objStart = -1
      }
    } else if (c === ']' && depth === 0) {
      break
    }
  }
  return out
}
