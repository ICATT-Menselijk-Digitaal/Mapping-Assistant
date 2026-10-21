// Generates the large coupling sets in test-data/perf/ that are used to
// measure field hover performance (Feature #195). Both files are built with
// the app's own parser, coupling rules and exporter, so they always match
// what the app itself would export — re-run this after an export format
// change. Run from frontend/: `npm run perf:datasets`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'
import type { DataType, FieldMapping, SchemaField } from '@/types'
import type { Schema } from '@/domain/schema'
import { addDefaultValueCoupling, addMapping } from '@/domain/mappingOps'
import { parseOpenApiSchemaFiltered, schemasByOperation } from '@/utils/openApiParser'
import { buildSchemaFromFields } from '@/utils/schemaFromFields'
import { serializeMappingSet, type ExportedAIStatistics } from '@/utils/exportSerializer'

const OUT_DIR = resolve(process.cwd(), 'test-data/perf')
const EXPORTED_AT = '2026-10-20T00:00:00.000Z'
const NO_AI_STATS: ExportedAIStatistics = {
  totalGenerated: 0,
  accepted: 0,
  rejected: 0,
  rejectedPairs: [],
}

// Pinned to a commit so regenerating yields the same schemas.
const DET_SPEC_URL =
  'https://raw.githubusercontent.com/NL-AMS-LOCGOV/esuite-data-extractie/bc76406e6d1e5c584922f5fd256f7747515b9604/openapi-spec/OpenAPI.yaml'
const OPENZAAK_SPEC_URL =
  'https://raw.githubusercontent.com/open-zaak/open-zaak/9f6a26e6ce80c24e36da05f2a0acc1fcd36828fe/src/openzaak/components/zaken/openapi.yaml'

const COUPLING_COUNT = 350
const HOTSPOT_COUPLINGS = 60
const DEFAULT_VALUE_COUPLINGS = 5

type Pair = [sourceFieldId: string, targetFieldId: string]

const DATA_TYPES: DataType[] = ['string', 'number', 'boolean', 'date']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function generatedLeaf(path: string, i: number): SchemaField {
  const name = path.slice(path.lastIndexOf('.') + 1)
  const field: SchemaField = {
    id: path,
    name,
    path,
    dataType: DATA_TYPES[i % DATA_TYPES.length]!,
    required: i % 5 === 0,
  }
  if (i % 3 === 0) field.description = `Omschrijving van ${name}`
  if (field.dataType === 'string' && i % 4 === 0) field.maxLength = 40 + (i % 200)
  if (i % 17 === 0) {
    field.dataType = 'string'
    field.enumValues = ['actief', 'inactief', 'onbekend']
  }
  return field
}

/** 10 objects × (40 fields + 2 nested objects of 5 fields) = 500 leaf fields. */
function generatedSchema(name: string, objectPrefix: string): Schema {
  const fields: SchemaField[] = []
  let i = 0
  for (let o = 1; o <= 10; o++) {
    const object = `${objectPrefix}${pad(o)}`
    for (let f = 1; f <= 40; f++) fields.push(generatedLeaf(`${object}.veld${pad(f)}`, i++))
    for (let n = 1; n <= 2; n++) {
      const nested = `${object}.onderdeel${n}`
      fields.push({
        id: nested,
        name: `onderdeel${n}`,
        path: nested,
        dataType: 'object',
        required: false,
      })
      for (let f = 1; f <= 5; f++) fields.push(generatedLeaf(`${nested}.veld${f}`, i++))
    }
  }
  return buildSchemaFromFields(name, fields)
}

function leaves(schema: Schema): SchemaField[] {
  return schema.all().filter((f) => schema.childrenOf(f.id).length === 0)
}

/** Couples each still-uncoupled target to a spread-out source, up to `count` pairs in total. */
function fillPairs(pairs: Pair[], sources: SchemaField[], targets: SchemaField[], count: number) {
  const coupled = new Set(pairs.map(([, t]) => t))
  const result = [...pairs]
  let k = 0
  for (const target of targets) {
    if (result.length >= count) break
    if (coupled.has(target.id)) continue
    result.push([sources[(k++ * 7) % sources.length]!.id, target.id])
  }
  return result
}

/** Real-schema pairing: same-named fields first, the rest spread out. */
function pairByName(sources: SchemaField[], targets: SchemaField[]): Pair[] {
  const sourceByName = new Map<string, string>()
  for (const s of sources) {
    const key = s.name.toLowerCase()
    if (!sourceByName.has(key)) sourceByName.set(key, s.id)
  }
  return targets.flatMap((t): Pair[] => {
    const sourceId = sourceByName.get(t.name.toLowerCase())
    return sourceId ? [[sourceId, t.id]] : []
  })
}

// Goes through the app's own coupling rules, so one coupling per target holds.
function buildMappings(pairs: Pair[], defaultValueTargetIds: string[] = []): FieldMapping[] {
  let list: FieldMapping[] = []
  for (const [sourceFieldId, targetFieldId] of pairs) {
    list = addMapping(list, { sourceFieldId, targetFieldId }).list
  }
  for (const targetFieldId of defaultValueTargetIds) {
    list = addDefaultValueCoupling(list, { targetFieldId }).list
  }
  return list
}

// Mirrors a URL load in the app: source shows GET responses, target POST requests.
async function fetchSchema(
  url: string,
  method: 'get' | 'post',
  role: 'response' | 'request',
): Promise<Schema> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Fetching ${url} failed (${response.status})`)
  const spec = yaml.load(await response.text())
  return parseOpenApiSchemaFiltered(spec, schemasByOperation(spec, method, role).names)
}

function writeDataset(file: string, source: Schema, target: Schema, mappings: FieldMapping[]) {
  const payload = serializeMappingSet({
    source: { schema: source, sourceUrl: null },
    target: { schema: target, sourceUrl: null },
    mappings,
    aiStats: NO_AI_STATS,
    exportedAt: EXPORTED_AT,
  })
  writeFileSync(resolve(OUT_DIR, file), `${JSON.stringify(payload, null, 2)}\n`)
  console.log(
    `${file}: ${leaves(source).length} source fields, ${leaves(target).length} target fields, ${mappings.length} couplings`,
  )
}

function writeGeneratedDataset() {
  const source = generatedSchema('Gegenereerde bron', 'BronObject')
  const target = generatedSchema('Gegenereerd doel', 'DoelObject')
  const sources = leaves(source)
  const targets = leaves(target)

  // One source field coupled to many targets: the "many connections" edge case.
  const hotspot = targets.slice(0, HOTSPOT_COUPLINGS).map((t): Pair => [sources[0]!.id, t.id])
  const pairs = fillPairs(hotspot, sources.slice(1), targets, COUPLING_COUNT)
  const defaultValueTargets = targets
    .slice(COUPLING_COUNT, COUPLING_COUNT + DEFAULT_VALUE_COUPLINGS)
    .map((t) => t.id)

  writeDataset(
    'generated.koppelingsset.json',
    source,
    target,
    buildMappings(pairs, defaultValueTargets),
  )
}

async function writeRealDataset() {
  const source = await fetchSchema(DET_SPEC_URL, 'get', 'response')
  const target = await fetchSchema(OPENZAAK_SPEC_URL, 'post', 'request')
  const sources = leaves(source)
  const targets = leaves(target)
  const pairs = fillPairs(pairByName(sources, targets), sources, targets, COUPLING_COUNT)
  writeDataset('det-openzaak.koppelingsset.json', source, target, buildMappings(pairs))
}

export default async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })
  writeGeneratedDataset()
  await writeRealDataset()
}
