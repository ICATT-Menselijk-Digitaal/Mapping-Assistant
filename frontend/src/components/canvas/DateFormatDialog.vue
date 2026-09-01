<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { buildDateFormatExpression, buildSolutionLabel } from '@/utils/mismatchExpressions'
import MismatchDialogShell from './MismatchDialogShell.vue'

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
</script>

<template>
  <MismatchDialogShell
    title="Datumnotatie omzetten"
    :can-save="canSave"
    @close="emit('close')"
    @save="save"
  >
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
  </MismatchDialogShell>
</template>
