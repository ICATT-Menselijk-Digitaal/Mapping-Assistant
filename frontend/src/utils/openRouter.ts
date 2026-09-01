/**
 * Thin client for OpenRouter's chat completions endpoint. Centralises the
 * URL, model, auth wiring, and the two error kinds the app cares about so
 * every AI-facing feature calls the model in the same way.
 */

export const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-6'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AIServiceError'
  }
}

export class AIKeyRejectedError extends AIServiceError {
  constructor() {
    super('API key rejected by the AI provider')
    this.name = 'AIKeyRejectedError'
  }
}

interface TextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | TextBlock[]
}

export interface ChatRequest {
  apiKey: string
  maxTokens: number
  messages: ChatMessage[]
}

/**
 * Call OpenRouter with the given messages and return the assistant's raw
 * text content. Throws `AIKeyRejectedError` on 401/403 and `AIServiceError`
 * for other failures — callers decide how to surface these.
 */
export async function callOpenRouter({
  apiKey,
  maxTokens,
  messages,
}: ChatRequest): Promise<string> {
  let response: Response
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: maxTokens,
        messages,
      }),
    })
  } catch (e) {
    throw new AIServiceError('AI service unreachable', e)
  }

  if (response.status === 401 || response.status === 403) {
    throw new AIKeyRejectedError()
  }
  if (!response.ok) {
    throw new AIServiceError(`OpenRouter API returned ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Extract the first `{...}` JSON object from a raw LLM response, tolerating
 * markdown code fences and any surrounding prose. Returns `null` when no
 * valid object can be parsed.
 */
export function extractJsonObject<T = unknown>(raw: string): T | null {
  let text = raw.trim()
  if (text.startsWith('```')) {
    const firstNewline = text.indexOf('\n')
    const lastFence = text.lastIndexOf('```')
    if (firstNewline !== -1 && lastFence > firstNewline) {
      text = text.slice(firstNewline + 1, lastFence).trim()
    }
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
