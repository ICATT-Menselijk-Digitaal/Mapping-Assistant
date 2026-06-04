import type { SolutionParams } from '@/types/mapping'

export function buildTruncationExpression(maxLength: number, sourcePath: string): string {
  return `$length(${sourcePath}) > ${maxLength} ? $substring(${sourcePath}, 0, ${maxLength - 3}) & "..." : ${sourcePath}`
}

export function buildDefaultExpression(value: string, sourcePath: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `${sourcePath} != null ? ${sourcePath} : "${escaped}"`
}

export function buildCastExpression(from: string, to: string, sourcePath: string): string {
  if (to === 'string') return `$string(${sourcePath})`
  throw new Error(`Unsupported cast: ${from} → ${to}`)
}

export function buildDateFormatExpression(
  srcFmt: string,
  tgtFmt: string,
  sourcePath: string,
): string {
  return `$fromMillis($toMillis(${sourcePath}, "${srcFmt}"), "${tgtFmt}")`
}

export function buildSolutionLabel(params: SolutionParams): string {
  switch (params.type) {
    case 'truncate':
      return `Afkappen op ${params.maxLength} tekens`
    case 'default':
      return `Standaardwaarde: ${params.value}`
    case 'cast':
      return params.from === 'number' && params.to === 'string'
        ? 'Getal naar tekst'
        : `${params.from} naar ${params.to}`
    case 'date-format':
      return `Datumnotatie: ${params.sourceFormat} → ${params.targetFormat}`
  }
}
