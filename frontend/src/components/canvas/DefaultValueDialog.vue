<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { buildDefaultExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'
import MismatchDialogShell from './MismatchDialogShell.vue'

const props = defineProps<{ mappingId: string; sourcePath: string }>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()
const value = ref('')
const canSave = computed(() => value.value.trim() !== '')

function save() {
  if (!canSave.value) return
  const v = value.value
  const params = { type: 'default' as const, value: v }
  store.addTransformationRule(props.mappingId, {
    expression: buildDefaultExpression(v, props.sourcePath),
    label: buildSolutionLabel(params),
    source: 'mismatch-solution',
    resolvesMismatch: 'default',
    solutionParams: params,
  })
  emit('close')
}
</script>

<template>
  <MismatchDialogShell
    title="Standaardwaarde instellen"
    :can-save="canSave"
    @close="emit('close')"
    @save="save"
  >
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
      {{ buildDefaultExpression(value, sourcePath) }}
    </div>
  </MismatchDialogShell>
</template>
