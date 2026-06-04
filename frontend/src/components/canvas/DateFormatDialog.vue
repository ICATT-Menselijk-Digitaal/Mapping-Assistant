<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { buildDateFormatExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'

const props = defineProps<{ mappingId: string; sourcePath: string }>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()
const sourceFormat = ref('')
const targetFormat = ref('')
const canSave = computed(() => sourceFormat.value.trim() !== '' && targetFormat.value.trim() !== '')

function save() {
  if (!canSave.value) return
  const sf = sourceFormat.value.trim()
  const tf = targetFormat.value.trim()
  const params = { type: 'date-format' as const, sourceFormat: sf, targetFormat: tf }
  store.addTransformationRule(props.mappingId, {
    expression: buildDateFormatExpression(sf, tf, props.sourcePath),
    label: buildSolutionLabel(params),
    source: 'mismatch-solution',
    resolvesMismatch: 'date-format',
    solutionParams: params,
  })
  emit('close')
}

function cancel() {
  emit('close')
}
</script>

<template>
  <div class="p-4 space-y-3">
    <h3 class="font-medium text-sm">Datumnotatie omzetten</h3>
    <label class="block text-sm">
      Bronnotatie
      <input
        v-model="sourceFormat"
        type="text"
        class="mt-1 block w-full border rounded px-2 py-1 text-sm font-mono"
        placeholder="bijv. YYYY-MM-DD"
      />
    </label>
    <label class="block text-sm">
      Doelnotatie
      <input
        v-model="targetFormat"
        type="text"
        class="mt-1 block w-full border rounded px-2 py-1 text-sm font-mono"
        placeholder="bijv. DD/MM/YYYY"
      />
    </label>
    <div class="flex gap-2 justify-end">
      <button data-testid="cancel-button" class="px-3 py-1 text-sm border rounded" @click="cancel">
        Annuleren
      </button>
      <button
        data-testid="save-button"
        class="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-40"
        :disabled="!canSave"
        @click="save"
      >
        Opslaan
      </button>
    </div>
  </div>
</template>
