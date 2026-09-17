import type { DataType } from '@/types'
import { buildSchema, type Schema, type SchemaFieldNode } from '@/domain/schema'

function mapType(prop: Record<string, unknown>): DataType {
  if (prop.format === 'date' || prop.format === 'date-time') return 'date'
  const map: Record<string, DataType> = {
    string: 'string',
    integer: 'number',
    number: 'number',
    boolean: 'boolean',
    object: 'object',
    array: 'array',
  }
  return map[prop.type as string] ?? 'unknown'
}

function resolveRef(ref: string, schemas: Record<string, unknown>): Record<string, unknown> | null {
  // Handles local $ref: '#/components/schemas/Foo' or '#/definitions/Foo'
  const parts = ref.split('/')
  const name = parts[parts.length - 1] as string | undefined
  if (!name) return null
  return (schemas[name] as Record<string, unknown>) ?? null
}

function isNullSchema(s: Record<string, unknown>): boolean {
  return s.type === 'null'
}

// Follows $ref and unwraps allOf/anyOf/oneOf composition into one merged,
// concrete schema object. allOf merges every branch's properties (the
// "extend a base schema" pattern); anyOf/oneOf pick the first non-null
// branch (the common OpenAPI 3.1 "nullable $ref" pattern:
// anyOf: [{ $ref: ... }, { type: 'null' }]). A true heterogeneous union
// (multiple differently-typed non-null branches) isn't modeled — the first
// non-null branch wins, same as picking a representative type.
function resolveComposition(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
): Record<string, unknown> {
  if (p.$ref && typeof p.$ref === 'string') {
    const refSchema = resolveRef(p.$ref, allSchemas)
    return refSchema ? resolveComposition(refSchema, allSchemas) : p
  }

  if (Array.isArray(p.allOf)) {
    const branches = (p.allOf as Record<string, unknown>[]).map((b) =>
      resolveComposition(b, allSchemas),
    )
    const properties = Object.assign({}, ...branches.map((b) => b.properties ?? {})) as Record<
      string,
      unknown
    >
    const required = branches.flatMap((b) => (b.required as string[]) ?? [])
    const typedBranch = branches.find((b) => typeof b.type === 'string')
    return {
      ...p,
      ...(typedBranch ? { type: typedBranch.type } : {}),
      ...(Object.keys(properties).length > 0 ? { properties, required } : {}),
    }
  }

  const branches = (p.anyOf ?? p.oneOf) as Record<string, unknown>[] | undefined
  if (Array.isArray(branches)) {
    const resolvedBranches = branches.map((b) => resolveComposition(b, allSchemas))
    const chosen = resolvedBranches.find((b) => !isNullSchema(b)) ?? resolvedBranches[0]
    return chosen ? { ...p, ...chosen } : p
  }

  return p
}

// Resolves $ref/composition, then normalizes: a resolved schema with
// properties but no explicit "type" (common for $ref targets and merged
// allOf branches) is treated as an object, matching how a plain inline
// `{ type: 'object', properties: {...} }` field is read.
function resolveSchema(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
): Record<string, unknown> {
  const resolved = resolveComposition(p, allSchemas)
  if (resolved.properties && !resolved.type) return { ...resolved, type: 'object' }
  return resolved
}

// Returns children for a property that is an object, $ref, composed
// (allOf/anyOf/oneOf), or array-of-objects
function childrenFor(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  path: string,
): SchemaFieldNode[] | undefined {
  const resolved = resolveSchema(p, allSchemas)
  if (resolved.properties) {
    return extractChildren(resolved, allSchemas, path)
  }
  if (resolved.type === 'array') {
    const items = resolved.items as Record<string, unknown> | undefined
    if (items) return childrenFor(items, allSchemas, path)
  }
  return undefined
}

function extractChildren(
  schema: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  parentPath: string,
): SchemaFieldNode[] | undefined {
  const properties = schema.properties as Record<string, unknown> | undefined
  if (!properties) return undefined

  const required = (schema.required as string[]) ?? []
  const children: SchemaFieldNode[] = []

  for (const [propName, prop] of Object.entries(properties)) {
    const p = prop as Record<string, unknown>
    const path = `${parentPath}.${propName}`

    // Resolve $ref/composition at this level so mapType and description
    // come from the target/merged schema
    const display = resolveSchema(p, allSchemas)

    const field: SchemaFieldNode = {
      id: path,
      name: propName,
      path,
      dataType: mapType(display),
      required: required.includes(propName),
      description: display.description as string | undefined,
      maxLength: display.maxLength as number | undefined,
    }

    const nested = childrenFor(p, allSchemas, path)
    if (nested) field.children = nested

    children.push(field)
  }

  return children.length > 0 ? children : undefined
}

function parseOpenApiTree(spec: unknown): SchemaFieldNode[] {
  if (!spec || typeof spec !== 'object') throw new Error('Invalid spec: expected an object')

  const s = spec as Record<string, unknown>

  if (!('openapi' in s) && !('swagger' in s)) {
    throw new Error('Geen geldig OpenAPI-schema: veld "openapi" of "swagger" ontbreekt')
  }

  const schemas: Record<string, unknown> =
    ((s.components as Record<string, unknown>)?.schemas as Record<string, unknown>) ??
    (s.definitions as Record<string, unknown>) ??
    {}

  const schemaNames = Object.keys(schemas)
  if (schemaNames.length === 0) return []

  const fields: SchemaFieldNode[] = []
  const multiSchema = schemaNames.length > 1

  for (const schemaName of schemaNames) {
    const schema = schemas[schemaName] as Record<string, unknown>
    const properties = schema.properties as Record<string, unknown> | undefined
    if (!properties) continue

    const required = (schema.required as string[]) ?? []

    for (const [propName, prop] of Object.entries(properties)) {
      const p = prop as Record<string, unknown>
      const path = multiSchema ? `${schemaName}.${propName}` : propName

      // Resolve $ref/composition at this level so display type/description
      // come from the target/merged schema
      const display = resolveSchema(p, schemas)

      const field: SchemaFieldNode = {
        id: path,
        name: propName,
        path,
        dataType: mapType(display),
        required: required.includes(propName),
        description: display.description as string | undefined,
        maxLength: display.maxLength as number | undefined,
      }

      const children = childrenFor(p, schemas, path)
      if (children) field.children = children

      fields.push(field)
    }
  }

  return fields
}

function extractSchemaName(spec: unknown): string {
  if (!spec || typeof spec !== 'object') return ''
  const s = spec as Record<string, unknown>
  const info = s.info as Record<string, unknown> | undefined
  return (info?.title as string) ?? ''
}

export function parseOpenApiSchema(spec: unknown): Schema {
  const tree = parseOpenApiTree(spec)
  return buildSchema(extractSchemaName(spec), tree)
}
