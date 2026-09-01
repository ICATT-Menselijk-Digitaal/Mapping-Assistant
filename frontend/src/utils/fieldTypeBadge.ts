/**
 * Small colour-and-label descriptor for the type badges shown next to
 * schema-field rows across the canvas. Centralised so every field-rendering
 * component uses the same palette and abbreviations.
 */
export interface FieldTypeBadge {
  bg: string
  text: string
  label: string
}

const FALLBACK_BADGE: FieldTypeBadge = { bg: 'bg-slate-100', text: 'text-slate-400', label: '?' }

const BADGES: Record<string, FieldTypeBadge> = {
  string: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'str' },
  number: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'num' },
  boolean: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'bool' },
  date: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'date' },
  object: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'obj' },
  array: { bg: 'bg-cyan-50', text: 'text-cyan-600', label: 'arr' },
}

export function fieldTypeBadge(dataType: string): FieldTypeBadge {
  return BADGES[dataType] ?? FALLBACK_BADGE
}
