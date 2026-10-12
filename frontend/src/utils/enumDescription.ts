// Composes the "Can contain '…'" line shown in the schema panel's description
// section for enum-typed fields. Single-quoted values, comma-separated, no
// trailing comma even for a one-value enum. Returns null when there are no
// values to show so callers can skip rendering the line entirely.
export function enumValuesLine(values: readonly string[] | undefined): string | null {
  if (!values || values.length === 0) return null
  const quoted = values.map((v) => `'${v}'`).join(', ')
  return `Can contain ${quoted}`
}
