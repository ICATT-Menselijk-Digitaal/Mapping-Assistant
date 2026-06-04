<script setup lang="ts">
import { computed } from 'vue'
import type { Schema, ParsedEndpoint } from '@/domain/schema'
import { useExport } from '@/composables/useExport'
import { downloadAsJson } from '@/utils/downloadHelper'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
  sourceUrl: string | null
  targetUrl: string | null
  selectedSourceEndpoint?: ParsedEndpoint | null
  selectedTargetEndpoint?: ParsedEndpoint | null
}>()

const { exportMappingSet } = useExport()

const canExport = computed(
  () => props.sourceSchema.all().length > 0 && props.targetSchema.all().length > 0,
)

function handleExport() {
  const payload = exportMappingSet(
    { schema: props.sourceSchema, sourceUrl: props.sourceUrl, selectedEndpoint: props.selectedSourceEndpoint ?? null },
    { schema: props.targetSchema, sourceUrl: props.targetUrl, selectedEndpoint: props.selectedTargetEndpoint ?? null },
  )
  const date = new Date().toISOString().slice(0, 10)
  downloadAsJson(payload, `koppelingsset-${date}.json`)
}
</script>

<template>
  <button
    :disabled="!canExport"
    class="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
    :title="!canExport ? 'Laad eerst een bron- en doelschema' : undefined"
    @click="handleExport"
  >
    Exporteer koppelingsset
  </button>
</template>
