<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { buildTruncationExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'
import MismatchDialogShell from './MismatchDialogShell.vue'

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
</script>

<template>
  <MismatchDialogShell
    title="Afkappen op maximale lengte"
    :can-save="canSave"
    @close="emit('close')"
    @save="save"
  >
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
  </MismatchDialogShell>
</template>
