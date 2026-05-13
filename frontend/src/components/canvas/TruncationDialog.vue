<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { buildTruncationExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'

const props = defineProps<{ mappingId: string; sourcePath: string; targetMaxLength?: number }>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()
const maxLength = ref<number | null>(props.targetMaxLength ?? null)
const canSave = computed(() => maxLength.value !== null && maxLength.value > 0)

function save() {
  if (!canSave.value || maxLength.value === null) return
  const ml = maxLength.value
  const params = { type: 'truncate' as const, maxLength: ml }
  store.addTransformationRule(props.mappingId, {
    expression: buildTruncationExpression(ml, props.sourcePath),
    label: buildSolutionLabel(params),
    source: 'mismatch-solution',
    resolvesMismatch: 'truncate',
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
    <h3 class="font-medium text-sm">Afkappen op maximale lengte</h3>
    <label class="block text-sm">
      Maximale lengte
      <input
        v-model.number="maxLength"
        type="number"
        min="1"
        class="mt-1 block w-full border rounded px-2 py-1 text-sm"
        placeholder="bijv. 50"
      />
    </label>
    <div v-if="maxLength && maxLength > 0" class="text-xs text-gray-500 font-mono break-all">
      {{ buildTruncationExpression(maxLength, sourcePath) }}
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
