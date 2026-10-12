export type DataType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown'

export interface SchemaField {
  id: string
  name: string
  path: string // dot-notation, e.g. "address.city"
  dataType: DataType
  required: boolean
  maxLength?: number
  description?: string
  // Allowed values when the OpenAPI property declares `enum`. Presence of a
  // non-empty array is what marks a field as enum-typed; dataType stays the
  // base scalar (e.g. 'string') so sorting/display logic doesn't need a new
  // branch.
  enumValues?: string[]
}

export interface SourceSystem {
  id: string
  name: string
  description?: string
}

export interface SourceSchema {
  id: string
  sourceSystemId: string
  name: string
  fields: SchemaField[]
}

export interface TargetSystem {
  id: string
  name: string
  description?: string
}

export interface TargetSchema {
  id: string
  targetSystemId: string
  name: string
  fields: SchemaField[]
}
