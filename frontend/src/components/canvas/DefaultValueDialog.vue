<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { buildDefaultExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'

const props = defineProps<{ mappingId: string }>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()
const value = ref('')
const canSave = computed(() => value.value.trim() !== '')

function save() {
  if (!canSave.value) return
  const v = value.value
  const params = { type: 'default' as const, value: v }
  store.addTransformationRule(props.mappingId, {
    expression: buildDefaultExpression(v),
    label: buildSolutionLabel(params),
    source: 'mismatch-solution',
    resolvesMismatch: 'default',
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
    <h3 class="font-medium text-sm">Standaardwaarde instellen</h3>
    <label class="block text-sm">
      Standaardwaarde
      <input
        v-model="value"
        type="text"
        class="mt-1 block w-full border rounded px-2 py-1 text-sm"
        placeholder="bijv. onbekend"
      />
    </label>
    <div v-if="canSave" class="text-xs text-gray-500 font-mono break-all">
      {{ buildDefaultExpression(value) }}
    </div>
    <div class="flex gap-2 justify-end">
      <button data-testid="cancel-button" class="px-3 py-1 text-sm border rounded" @click="cancel">Annuleren</button>
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
