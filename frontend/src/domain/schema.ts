import type { DataType, SchemaField } from '@/types'

// Internal tree representation used during parsing. Consumers must not
// traverse this — they go through Schema methods. Exported only so the
// OpenAPI parser can build the tree before handing it to buildSchema.
export interface SchemaFieldNode extends SchemaField {
  children?: SchemaFieldNode[]
}

export interface Schema {
  readonly name: string
  readonly roots: readonly SchemaField[]
  byId(id: string): SchemaField | undefined
  has(id: string): boolean
  all(): readonly SchemaField[]
  childrenOf(id: string): readonly SchemaField[]
  parentOf(id: string): SchemaField | undefined
  pathOf(id: string): readonly SchemaField[]
}

function stripChildren(node: SchemaFieldNode): SchemaField {
  const { children: _children, ...rest } = node
  return rest
}

export function buildSchema(name: string, tree: readonly SchemaFieldNode[]): Schema {
  const byId = new Map<string, SchemaField>()
  const parentOf = new Map<string, string>()
  const childrenOf = new Map<string, SchemaField[]>()
  const all: SchemaField[] = []
  const rootFields: SchemaField[] = []

  function walk(node: SchemaFieldNode, parentId: string | null): SchemaField {
    const field = stripChildren(node)
    byId.set(field.id, field)
    all.push(field)
    if (parentId !== null) parentOf.set(field.id, parentId)

    const kids: SchemaField[] = []
    if (node.children) {
      for (const child of node.children) kids.push(walk(child, field.id))
    }
    childrenOf.set(field.id, kids)
    return field
  }

  for (const root of tree) rootFields.push(walk(root, null))

  const schema: Schema = {
    name,
    roots: Object.freeze(rootFields),
    byId: (id) => byId.get(id),
    has: (id) => byId.has(id),
    all: () => all,
    childrenOf: (id) => childrenOf.get(id) ?? [],
    parentOf: (id) => {
      const pid = parentOf.get(id)
      return pid ? byId.get(pid) : undefined
    },
    pathOf: (id) => {
      const out: SchemaField[] = []
      let cur: string | undefined = id
      while (cur) {
        const f = byId.get(cur)
        if (!f) break
        out.unshift(f)
        cur = parentOf.get(cur)
      }
      return out
    },
  }
  return Object.freeze(schema)
}

export const EMPTY_SCHEMA: Schema = buildSchema('', [])

export interface ParsedEndpoint {
  path: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  operationId?: string
  summary?: string
  schema: Schema
}

// Re-export DataType so domain consumers can import everything from one place.
export type { DataType, SchemaField }
