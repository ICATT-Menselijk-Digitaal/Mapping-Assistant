<script setup lang="ts">
import { useMappings } from '@/composables/useMappings'
import { buildCastExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'
import MismatchDialogShell from './MismatchDialogShell.vue'

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
</script>

<template>
  <MismatchDialogShell
    title="Type conversie bevestigen"
    save-label="Bevestigen"
    @close="emit('close')"
    @save="save"
  >
    <p class="text-sm text-gray-600">
      Converteer <span class="font-mono">{{ fromType }}</span> naar
      <span class="font-mono">{{ toType }}</span
      >.
    </p>
  </MismatchDialogShell>
</template>
