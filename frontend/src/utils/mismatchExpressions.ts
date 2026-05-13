import type { SolutionParams } from '@/types/mapping'

export function buildTruncationExpression(maxLength: number): string {
  return `$length($) > ${maxLength} ? $substring($, 0, ${maxLength - 3}) & "..." : $`
}

export function buildDefaultExpression(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `$ != null ? $ : "${escaped}"`
}

export function buildCastExpression(from: string, to: string): string {
  if (from === 'number' && to === 'string') return '$string($)'
  throw new Error(`Unsupported cast: ${from} → ${to}`)
}

export function buildDateFormatExpression(srcFmt: string, tgtFmt: string): string {
  return `$fromMillis($toMillis($, "${srcFmt}"), "${tgtFmt}")`
}

export function buildSolutionLabel(params: SolutionParams): string {
  switch (params.type) {
    case 'truncate':    return `Afkappen op ${params.maxLength} tekens`
    case 'default':     return `Standaardwaarde: ${params.value}`
    case 'cast':        return params.from === 'number' && params.to === 'string' ? 'Getal naar tekst' : `${params.from} naar ${params.to}`
    case 'date-format': return `Datumnotatie: ${params.sourceFormat} → ${params.targetFormat}`
  }
}
