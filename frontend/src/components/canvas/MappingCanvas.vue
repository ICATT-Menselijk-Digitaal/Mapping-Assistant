<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Schema, ParsedEndpoint } from '@/domain/schema'
import SourceSchemaPanel from './SourceSchemaPanel.vue'
import SchemaColumnHeader from './SchemaColumnHeader.vue'
import ConnectionLines from './ConnectionLines.vue'
import { useMappings } from '@/composables/useMappings'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
  sourceLabel?: string
  targetLabel?: string
  sourceEndpoints?: readonly ParsedEndpoint[]
  targetEndpoints?: readonly ParsedEndpoint[]
}>()

const emit = defineEmits<{
  FieldMappingCreated: [payload: { sourceFieldId: string; targetFieldId: string }]
  FieldMappingRemoved: [payload: { sourceFieldId: string; targetFieldId: string }]
  SourceFileSelected: [file: File]
  SourceUrlEntered: [url: string]
  TargetFileSelected: [file: File]
  TargetUrlEntered: [url: string]
  SourceEndpointChanged: [endpoint: ParsedEndpoint]
  TargetEndpointChanged: [endpoint: ParsedEndpoint]
}>()

const selectedSourceEndpoint = ref<ParsedEndpoint | null>(null)
const selectedTargetEndpoint = ref<ParsedEndpoint | null>(null)

const activeSourceSchema = computed<Schema>(() => selectedSourceEndpoint.value?.schema ?? props.sourceSchema)
const activeTargetSchema = computed<Schema>(() => selectedTargetEndpoint.value?.schema ?? props.targetSchema)

function onSourceEndpointSelect(endpoint: ParsedEndpoint) {
  selectedSourceEndpoint.value = endpoint
  emit('SourceEndpointChanged', endpoint)
}

function onTargetEndpointSelect(endpoint: ParsedEndpoint) {
  selectedTargetEndpoint.value = endpoint
  emit('TargetEndpointChanged', endpoint)
}

const mappingsStore = useMappings()
const selectedSourceId = ref<string | null>(null)

const sourceCounter = computed(() => {
  const mappedIds = new Set(mappingsStore.mappings.map((m) => m.sourceFieldId))
  return { mapped: mappedIds.size, total: activeSourceSchema.value.all().length }
})

const targetCounter = computed(() => {
  const mappedTargetIds = new Set(mappingsStore.mappings.map((m) => m.targetFieldId))
  return {
    mapped: activeTargetSchema.value.all().filter((f) => mappedTargetIds.has(f.id)).length,
    total: activeTargetSchema.value.all().length,
  }
})

function onSourceFieldClick(fieldId: string) {
  selectedSourceId.value = selectedSourceId.value === fieldId ? null : fieldId
}

function onTargetFieldClick(fieldId: string) {
  if (!selectedSourceId.value) return

  const mapping = mappingsStore.createMapping({
    sourceFieldId: selectedSourceId.value,
    targetFieldId: fieldId,
    schemas: { source: activeSourceSchema.value, target: activeTargetSchema.value },
  })

  if (mapping) {
    emit('FieldMappingCreated', {
      sourceFieldId: mapping.sourceFieldId,
      targetFieldId: mapping.targetFieldId,
    })
  }

  selectedSourceId.value = null
}

function onSourceFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('SourceFileSelected', file)
}

const sourceUrlInput = ref('https://cors.redoc.ly/https://esuite-data-extractie-gcp2.esuite-development.net/q/openapi')

function onSourceUrlSubmit() {
  const url = sourceUrlInput.value.trim()
  if (url) emit('SourceUrlEntered', url)
}

function onTargetFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('TargetFileSelected', file)
}

const targetUrlInput = ref('https://openzaak.dev.kiss-demo.nl/zaken/api/v1/openapi.json')

function onTargetUrlSubmit() {
  const url = targetUrlInput.value.trim()
  if (url) emit('TargetUrlEntered', url)
}
</script>

<template>
  <div class="w-full h-full flex flex-col bg-slate-100">
    <!-- Two-panel layout -->
    <div class="relative flex-1 flex overflow-hidden gap-8">
      <!-- Source column -->
      <div
        class="flex-1 flex flex-col overflow-hidden bg-white border border-slate-200 rounded-sm"
        data-testid="source-column"
      >
        <SchemaColumnHeader v-if="sourceLabel" :data="{ label: sourceLabel, side: 'source' }" :counter="sourceCounter" />

        <!-- Upload UI when no source schema and no endpoints -->
        <div
          v-if="sourceSchema.all().length === 0 && !sourceEndpoints?.length"
          class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center"
          data-testid="source-upload"
        >
          <p class="text-sm text-slate-400">Laad een bronschema (OpenAPI YAML of JSON)</p>

          <!-- File picker -->
          <label class="cursor-pointer px-3 py-1.5 text-sm rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
            Bestand kiezen
            <input
              type="file"
              accept=".yaml,.yml,.json"
              class="sr-only"
              data-testid="source-file-input"
              @change="onSourceFileChange"
            />
          </label>

          <span class="text-xs text-slate-300">of</span>

          <!-- URL input -->
          <form class="flex gap-2 w-full max-w-xs" @submit.prevent="onSourceUrlSubmit">
            <input
              v-model="sourceUrlInput"
              type="url"
              placeholder="https://api.example.com/openapi.json"
              class="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              data-testid="source-url-input"
            />
            <button
              type="submit"
              class="shrink-0 px-2 py-1.5 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              data-testid="source-url-submit"
            >
              Laden
            </button>
          </form>
        </div>

        <!-- Field tree (with optional endpoint picker) -->
        <SourceSchemaPanel
          v-else
          class="flex-1 overflow-y-auto"
          data-scroll-container
          :schema="activeSourceSchema"
          :endpoints="sourceEndpoints"
          :selected-endpoint="selectedSourceEndpoint"
          side="source"
          @field-click="onSourceFieldClick"
          @endpoint-select="onSourceEndpointSelect"
        />
      </div>

      <!-- Target column -->
      <div
        class="flex-1 flex flex-col overflow-hidden bg-white border border-slate-200 rounded-sm"
        data-testid="target-column"
      >
        <SchemaColumnHeader v-if="targetLabel" :data="{ label: targetLabel, side: 'target' }" :counter="targetCounter" />

        <!-- Upload UI when no target schema and no endpoints -->
        <div
          v-if="targetSchema.all().length === 0 && !targetEndpoints?.length"
          class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center"
          data-testid="target-upload"
        >
          <p class="text-sm text-slate-400">Laad een doelschema (OpenAPI YAML of JSON)</p>

          <label class="cursor-pointer px-3 py-1.5 text-sm rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
            Bestand kiezen
            <input
              type="file"
              accept=".yaml,.yml,.json"
              class="sr-only"
              data-testid="target-file-input"
              @change="onTargetFileChange"
            />
          </label>

          <span class="text-xs text-slate-300">of</span>

          <form class="flex gap-2 w-full max-w-xs" @submit.prevent="onTargetUrlSubmit">
            <input
              v-model="targetUrlInput"
              type="url"
              placeholder="https://api.example.com/openapi.json"
              class="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-400"
              data-testid="target-url-input"
            />
            <button
              type="submit"
              class="shrink-0 px-2 py-1.5 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              data-testid="target-url-submit"
            >
              Laden
            </button>
          </form>
        </div>

        <!-- Field tree (with optional endpoint picker) -->
        <SourceSchemaPanel
          v-else
          class="flex-1 overflow-y-auto"
          data-scroll-container
          :schema="activeTargetSchema"
          :endpoints="targetEndpoints"
          :selected-endpoint="selectedTargetEndpoint"
          side="target"
          @field-click="onTargetFieldClick"
          @endpoint-select="onTargetEndpointSelect"
        />
      </div>

      <!-- SVG connection line overlay -->
      <ConnectionLines />
    </div>
  </div>
</template>

