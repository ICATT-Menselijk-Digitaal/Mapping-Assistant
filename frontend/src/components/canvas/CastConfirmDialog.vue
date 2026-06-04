<script setup lang="ts">
import { useMappings } from '@/composables/useMappings'
import { buildCastExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'

const props = defineProps<{
  mappingId: string
  sourcePath: string
  fromType: string
  toType: string
}>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()

function save() {
  const params = { type: 'cast' as const, from: props.fromType, to: props.toType }
  store.addTransformationRule(props.mappingId, {
    expression: buildCastExpression(props.fromType, props.toType, props.sourcePath),
    label: buildSolutionLabel(params),
    source: 'mismatch-solution',
    resolvesMismatch: 'cast',
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
    <h3 class="font-medium text-sm">Type conversie bevestigen</h3>
    <p class="text-sm text-gray-600">
      Converteer <span class="font-mono">{{ fromType }}</span> naar
      <span class="font-mono">{{ toType }}</span
      >.
    </p>
    <div class="flex gap-2 justify-end">
      <button data-testid="cancel-button" class="px-3 py-1 text-sm border rounded" @click="cancel">
        Annuleren
      </button>
      <button
        data-testid="save-button"
        class="px-3 py-1 text-sm bg-blue-600 text-white rounded"
        @click="save"
      >
        Bevestigen
      </button>
    </div>
  </div>
</template>
