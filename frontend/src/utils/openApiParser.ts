import type { DataType } from '@/types'
import { buildSchema, type Schema, type SchemaFieldNode, type ParsedEndpoint } from '@/domain/schema'

const MAX_DEPTH = 10

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

// Returns children for a property that is an object, $ref, or array-of-objects
function childrenFor(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  path: string,
): SchemaFieldNode[] | undefined {
  if (p.$ref && typeof p.$ref === 'string') {
    const refSchema = resolveRef(p.$ref, allSchemas)
    if (refSchema) return extractChildren(refSchema, allSchemas, path)
  }
  if (p.type === 'object' && p.properties) {
    return extractChildren(p, allSchemas, path)
  }
  if (p.type === 'array') {
    const items = p.items as Record<string, unknown> | undefined
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

    // Resolve $ref at this level so mapType and description come from the target schema
    let display = p
    if (p.$ref && typeof p.$ref === 'string') {
      const refSchema = resolveRef(p.$ref, allSchemas)
      if (refSchema) display = { ...refSchema, type: 'object' }
    }

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

      // Resolve $ref at this level so display type/description come from target schema
      let display = p
      if (p.$ref && typeof p.$ref === 'string') {
        const refSchema = resolveRef(p.$ref, schemas)
        if (refSchema) display = { ...refSchema, type: 'object' }
      }

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

function mergeAllOf(
  schema: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(schema.allOf)) return schema

  const mergedProperties: Record<string, unknown> = {}
  const mergedRequired: string[] = []

  for (const entry of schema.allOf as Record<string, unknown>[]) {
    let resolved = entry
    if (entry.$ref && typeof entry.$ref === 'string') {
      resolved = resolveRef(entry.$ref, allSchemas) ?? entry
    }
    if (resolved.properties && typeof resolved.properties === 'object') {
      Object.assign(mergedProperties, resolved.properties)
    }
    if (Array.isArray(resolved.required)) {
      mergedRequired.push(...(resolved.required as string[]))
    }
  }

  if (schema.properties && typeof schema.properties === 'object') {
    Object.assign(mergedProperties, schema.properties)
  }

  return {
    ...schema,
    properties: mergedProperties,
    required: [
      ...new Set([...(Array.isArray(schema.required) ? (schema.required as string[]) : []), ...mergedRequired]),
    ],
  }
}

function childrenForEndpoint(
  p: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  path: string,
  depth: number,
  visited: Set<string>,
): SchemaFieldNode[] | undefined {
  if (depth >= MAX_DEPTH) return undefined

  if (p.$ref && typeof p.$ref === 'string') {
    const refName = p.$ref.split('/').pop()!
    if (visited.has(refName)) return undefined
    const refSchema = resolveRef(p.$ref, allSchemas)
    if (refSchema) {
      const next = new Set(visited)
      next.add(refName)
      return extractChildrenEndpoint(refSchema, allSchemas, path, depth, next)
    }
    return undefined
  }

  if (Array.isArray(p.allOf)) {
    const merged = mergeAllOf(p, allSchemas)
    return extractChildrenEndpoint(merged, allSchemas, path, depth, visited)
  }

  if (p.type === 'object') {
    return extractChildrenEndpoint(p, allSchemas, path, depth, visited)
  }

  if (p.type === 'array') {
    const items = p.items as Record<string, unknown> | undefined
    if (items) return childrenForEndpoint(items, allSchemas, path, depth, visited)
  }

  return undefined
}

function extractChildrenEndpoint(
  schema: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
  parentPath: string,
  depth: number,
  visited: Set<string>,
): SchemaFieldNode[] | undefined {
  const effective = mergeAllOf(schema, allSchemas)
  const properties = effective.properties as Record<string, unknown> | undefined
  if (!properties) return undefined

  const required = (effective.required as string[]) ?? []
  const children: SchemaFieldNode[] = []

  for (const [propName, prop] of Object.entries(properties)) {
    const p = prop as Record<string, unknown>
    const path = parentPath ? `${parentPath}.${propName}` : propName

    let display = p
    if (p.$ref && typeof p.$ref === 'string') {
      const refSchema = resolveRef(p.$ref, allSchemas)
      if (refSchema) display = { ...refSchema, type: 'object' }
    } else if (Array.isArray(p.allOf)) {
      const merged = mergeAllOf(p, allSchemas)
      display = { ...merged, type: merged.type ?? 'object' }
    }

    const field: SchemaFieldNode = {
      id: path,
      name: propName,
      path,
      dataType: mapType(display),
      required: required.includes(propName),
      description: display.description as string | undefined,
      maxLength: display.maxLength as number | undefined,
    }

    const nested = childrenForEndpoint(p, allSchemas, path, depth + 1, visited)
    if (nested) field.children = nested

    children.push(field)
  }

  return children.length > 0 ? children : undefined
}

function buildEndpointTree(
  rootSchema: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
): SchemaFieldNode[] {
  const effective = mergeAllOf(rootSchema, allSchemas)
  const properties = effective.properties as Record<string, unknown> | undefined
  if (!properties) return []

  const required = (effective.required as string[]) ?? []
  const fields: SchemaFieldNode[] = []

  for (const [propName, prop] of Object.entries(properties)) {
    const p = prop as Record<string, unknown>
    const path = propName

    let display = p
    if (p.$ref && typeof p.$ref === 'string') {
      const refSchema = resolveRef(p.$ref, allSchemas)
      if (refSchema) display = { ...refSchema, type: 'object' }
    } else if (Array.isArray(p.allOf)) {
      const merged = mergeAllOf(p, allSchemas)
      display = { ...merged, type: merged.type ?? 'object' }
    }

    const field: SchemaFieldNode = {
      id: path,
      name: propName,
      path,
      dataType: mapType(display),
      required: required.includes(propName),
      description: display.description as string | undefined,
      maxLength: display.maxLength as number | undefined,
    }

    const nested = childrenForEndpoint(p, allSchemas, path, 1, new Set<string>())
    if (nested) field.children = nested

    fields.push(field)
  }

  return fields
}

function extractSchemaFromContent(
  container: Record<string, unknown>,
  allSchemas: Record<string, unknown>,
): Record<string, unknown> | null {
  const content = container.content as Record<string, unknown> | undefined
  if (content) {
    const jsonContent = content['application/json'] as Record<string, unknown> | undefined
    if (jsonContent) {
      let schema = jsonContent.schema as Record<string, unknown> | undefined
      if (schema) {
        if (schema.$ref && typeof schema.$ref === 'string') {
          schema = resolveRef(schema.$ref, allSchemas) ?? undefined
        }
        return schema ?? null
      }
    }
  }
  // Swagger 2.0: schema directly on the response/body object
  const schema = container.schema as Record<string, unknown> | undefined
  if (schema) {
    if (schema.$ref && typeof schema.$ref === 'string') {
      return resolveRef(schema.$ref, allSchemas)
    }
    return schema
  }
  return null
}

export function parseOpenApiEndpoints(spec: unknown): ParsedEndpoint[] {
  if (!spec || typeof spec !== 'object') return []

  const s = spec as Record<string, unknown>
  if (!('openapi' in s) && !('swagger' in s)) return []

  const paths = s.paths as Record<string, unknown> | undefined
  if (!paths) return []

  const allSchemas: Record<string, unknown> =
    ((s.components as Record<string, unknown>)?.schemas as Record<string, unknown>) ??
    (s.definitions as Record<string, unknown>) ??
    {}

  const endpoints: ParsedEndpoint[] = []
  const methods = ['get', 'post', 'put', 'patch', 'delete'] as const

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const pi = pathItem as Record<string, unknown>

    for (const method of methods) {
      const operation = pi[method] as Record<string, unknown> | undefined
      if (!operation) continue

      let rootSchema: Record<string, unknown> | null = null

      if (method === 'get') {
        const responses = operation.responses as Record<string, unknown> | undefined
        if (responses) {
          const response = (responses['200'] ?? responses['201'] ?? responses['default']) as
            | Record<string, unknown>
            | undefined
          if (response) rootSchema = extractSchemaFromContent(response, allSchemas)
        }
      } else {
        const requestBody = operation.requestBody as Record<string, unknown> | undefined
        if (requestBody) rootSchema = extractSchemaFromContent(requestBody, allSchemas)
      }

      const tree = rootSchema ? buildEndpointTree(rootSchema, allSchemas) : []

      endpoints.push({
        path,
        method,
        operationId: operation.operationId as string | undefined,
        summary: operation.summary as string | undefined,
        schema: buildSchema('', tree),
      })
    }
  }

  return endpoints
}
