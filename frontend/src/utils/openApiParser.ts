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

function refName(ref: string): string | undefined {
  const parts = ref.split('/')
  return parts[parts.length - 1]
}

function isNullSchema(s: Record<string, unknown>): boolean {
  return s.type === 'null'
}

interface Resolved {
  schema: Record<string, unknown>
  // $ref names consumed to reach `schema`, from the root of the current
  // field's tree walk. Grows going deeper, never shrinks or resets between
  // sibling branches — that's what lets a later $ref back to an
  // already-visited name be recognized as a cycle rather than legitimate
  // reuse of the same schema in an unrelated branch.
  visitedRefs: ReadonlySet<string>
  // True when `schema` IS a cycle-breaking stub (a $ref repeated on this
  // path, see below) — a signal to the caller building the field tree that
  // this node's own properties must not be expanded into children, even
  // though they're present. Cleared by allOf (a merge always produces a
  // new, legitimate combined shape, whatever its branches were); passed
  // through by anyOf/oneOf (picking a branch doesn't create new content, it
  // just forwards that branch's nature).
  hitCycle: boolean
}

// Follows $ref and unwraps allOf/anyOf/oneOf composition into one merged,
// concrete schema object. allOf merges every branch's properties together
// with the schema's own directly-declared properties (a schema can both
// `allOf` a base and declare fields of its own alongside it); anyOf/oneOf
// pick the first non-null branch (the common OpenAPI 3.1 "nullable $ref"
// pattern: anyOf: [{ $ref: ... }, { type: 'null' }]). A true heterogeneous
// union (multiple differently-typed non-null branches) isn't modeled — the
// first non-null branch wins, same as picking a representative type.
//
// A $ref that points back to a schema already on this path is a real,
// valid OpenAPI shape — most commonly a discriminator, where a base schema
// offers itself via oneOf (Subject -> Persoon | Bedrijf) and each option
// reaches back to the base via allOf to inherit its shared fields (Persoon
// -> allOf -> Subject). That reach-back must resolve (Persoon needs
// Subject's fields), but must not re-examine Subject's own oneOf again, or
// it recurses forever picking the same option. So a repeated $ref resolves
// to the target's own flat properties directly, skipping its composition —
// enough to merge into an allOf, and marked via `hitCycle` so a direct hit
// (rather than one flattened into a merge) isn't expanded into children
// (that case is the OTHER common shape: genuine self-reference, e.g. a
// "previous version" field with no natural end).
function resolveComposition(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  visitedRefs: ReadonlySet<string>,
): Resolved {
  if (p.$ref && typeof p.$ref === 'string') {
    const name = refName(p.$ref)
    if (!name) return { schema: p, visitedRefs, hitCycle: false }
    if (visitedRefs.has(name)) {
      const refSchema = resolveRef(p.$ref, allSchemas)
      return {
        schema: {
          ...p,
          type: 'object',
          properties: refSchema?.properties,
          required: refSchema?.required,
        },
        visitedRefs,
        hitCycle: true,
      }
    }
    const refSchema = resolveRef(p.$ref, allSchemas)
    if (!refSchema) return { schema: p, visitedRefs, hitCycle: false }
    return resolveComposition(refSchema, allSchemas, new Set(visitedRefs).add(name))
  }

  if (Array.isArray(p.allOf)) {
    const resolvedBranches = (p.allOf as Record<string, unknown>[]).map((b) =>
      resolveComposition(b, allSchemas, visitedRefs),
    )
    const branches = resolvedBranches.map((r) => r.schema)
    const mergedVisited = new Set(visitedRefs)
    for (const r of resolvedBranches) for (const name of r.visitedRefs) mergedVisited.add(name)
    const ownProperties = (p.properties as Record<string, unknown> | undefined) ?? {}
    const properties = Object.assign(
      {},
      ...branches.map((b) => b.properties ?? {}),
      ownProperties,
    ) as Record<string, unknown>
    const ownRequired = (p.required as string[]) ?? []
    const required = [...branches.flatMap((b) => (b.required as string[]) ?? []), ...ownRequired]
    const typedBranch = branches.find((b) => typeof b.type === 'string')
    return {
      schema: {
        ...p,
        ...(typedBranch ? { type: typedBranch.type } : {}),
        ...(Object.keys(properties).length > 0 ? { properties, required } : {}),
      },
      visitedRefs: mergedVisited,
      hitCycle: false,
    }
  }

  const branchList = (p.anyOf ?? p.oneOf) as Record<string, unknown>[] | undefined
  if (Array.isArray(branchList)) {
    const resolvedBranches = branchList.map((b) => resolveComposition(b, allSchemas, visitedRefs))
    const chosen = resolvedBranches.find((r) => !isNullSchema(r.schema)) ?? resolvedBranches[0]
    if (!chosen) return { schema: p, visitedRefs, hitCycle: false }
    return {
      schema: { ...p, ...chosen.schema },
      visitedRefs: chosen.visitedRefs,
      hitCycle: chosen.hitCycle,
    }
  }

  return { schema: p, visitedRefs, hitCycle: false }
}

// Resolves $ref/composition, then normalizes: a resolved schema with
// properties but no explicit "type" (common for $ref targets and merged
// allOf branches) is treated as an object, matching how a plain inline
// `{ type: 'object', properties: {...} }` field is read.
function resolveSchema(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  visitedRefs: ReadonlySet<string> = new Set(),
): Resolved {
  const resolved = resolveComposition(p, allSchemas, visitedRefs)
  if (resolved.schema.properties && !resolved.schema.type) {
    return { ...resolved, schema: { ...resolved.schema, type: 'object' } }
  }
  return resolved
}

// Returns children for a property that is an object, $ref, composed
// (allOf/anyOf/oneOf), or array-of-objects
function childrenFor(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  path: string,
  visitedRefs: ReadonlySet<string> = new Set(),
): SchemaFieldNode[] | undefined {
  const resolved = resolveSchema(p, allSchemas, visitedRefs)
  // A direct cycle hit (see resolveComposition) still reports its target's
  // own properties so it can be merged into an allOf — but as a node in the
  // tree itself, those properties must not be expanded, or a genuinely
  // self-referencing field (e.g. Document.vorigeVersie -> Document) would
  // recurse forever rebuilding the same subtree.
  if (resolved.hitCycle) return undefined
  if (resolved.schema.properties) {
    return extractChildren(resolved.schema, allSchemas, path, resolved.visitedRefs)
  }
  if (resolved.schema.type === 'array') {
    const items = resolved.schema.items as Record<string, unknown> | undefined
    if (items) return childrenFor(items, allSchemas, path, resolved.visitedRefs)
  }
  return undefined
}

function extractChildren(
  schema: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  parentPath: string,
  visitedRefs: ReadonlySet<string> = new Set(),
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
    const display = resolveSchema(p, allSchemas, visitedRefs).schema

    const field: SchemaFieldNode = {
      id: path,
      name: propName,
      path,
      dataType: mapType(display),
      required: required.includes(propName),
      description: display.description as string | undefined,
      maxLength: display.maxLength as number | undefined,
    }

    const nested = childrenFor(p, allSchemas, path, visitedRefs)
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
      const display = resolveSchema(p, schemas).schema

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
