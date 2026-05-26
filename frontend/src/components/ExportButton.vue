<script setup lang="ts">
import { computed } from 'vue'
import type { Schema } from '@/domain/schema'
import { useExport } from '@/composables/useExport'
import { downloadAsJson } from '@/utils/downloadHelper'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
}>()

const { exportMappingSet } = useExport()

const canExport = computed(
  () => props.sourceSchema.all().length > 0 && props.targetSchema.all().length > 0,
)

function handleExport() {
  const payload = exportMappingSet(props.sourceSchema, props.targetSchema)
  const date = new Date().toISOString().slice(0, 10)
  downloadAsJson(payload, `koppelingsset-${date}.json`)
}
</script>

<template>
  <button
    :disabled="!canExport"
    class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
    :title="!canExport ? 'Laad eerst een bron- en doelschema' : undefined"
    @click="handleExport"
  >
    Exporteer koppelingsset
  </button>
</template>
