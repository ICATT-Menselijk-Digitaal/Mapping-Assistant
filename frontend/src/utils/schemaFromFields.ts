import type { SchemaField } from '@/types'
import { buildSchema, type Schema, type SchemaFieldNode } from '@/domain/schema'

function parentPathOf(path: string): string | null {
  const idx = path.lastIndexOf('.')
  return idx === -1 ? null : path.slice(0, idx)
}

export function buildSchemaFromFields(name: string, fields: readonly SchemaField[]): Schema {
  const byPath = new Map<string, SchemaFieldNode>()
  for (const f of fields) byPath.set(f.path, { ...f, children: [] })

  const roots: SchemaFieldNode[] = []
  for (const f of fields) {
    const node = byPath.get(f.path)!
    const parentPath = parentPathOf(f.path)
    const parent = parentPath !== null ? byPath.get(parentPath) : undefined
    if (parent) {
      ;(parent.children ??= []).push(node)
    } else {
      roots.push(node)
    }
  }

  for (const node of byPath.values()) {
    if (node.children && node.children.length === 0) delete node.children
  }

  return buildSchema(name, roots)
}
