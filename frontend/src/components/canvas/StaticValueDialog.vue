<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SchemaField } from '@/types'
import type { StaticValueParams } from '@/types/mapping'
import { useMappings } from '@/composables/useMappings'
import { validateStaticValue, supportsStaticValue } from '@/utils/validateStaticValue'
import { buildStaticValueExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'
import MismatchDialogShell from './MismatchDialogShell.vue'

const props = defineProps<{ mappingId: string; targetField: SchemaField }>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()
const value = ref('')
const error = ref<string | null>(null)

const canSave = computed(
  () => value.value.trim() !== '' && supportsStaticValue(props.targetField.dataType),
)

// Resolved the same way every other detected problem is: a transformation
// rule tagged with resolvesMismatch, appearing in Transformatieregels where
// it can be removed (and re-added) exactly like any other mismatch solution.
function save() {
  if (!supportsStaticValue(props.targetField.dataType)) return
  const dataType = props.targetField.dataType
  const result = validateStaticValue(value.value, dataType, {
    maxLength: props.targetField.maxLength,
  })
  if (!result.valid) {
    error.value = result.error
    return
  }
  const trimmed = value.value.trim()
  const params: StaticValueParams = { type: 'static-value', value: trimmed, dataType }
  store.addTransformationRule(props.mappingId, {
    expression: buildStaticValueExpression(trimmed, dataType),
    label: buildSolutionLabel(params),
    source: 'mismatch-solution',
    resolvesMismatch: 'missing-source',
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
        :class="error ? 'border-red-400' : ''"
        data-testid="default-value-input"
        @input="error = null"
      />
    </label>
    <p v-if="error" class="text-xs text-red-600" data-testid="default-value-error">
      {{ error }}
    </p>
  </MismatchDialogShell>
</template>
