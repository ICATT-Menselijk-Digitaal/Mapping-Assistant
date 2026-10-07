<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SchemaField } from '@/types'
import { useMappings } from '@/composables/useMappings'
import { validateStaticValue, supportsStaticValue } from '@/utils/validateStaticValue'
import MismatchDialogShell from './MismatchDialogShell.vue'

const props = defineProps<{ mappingId: string; targetField: SchemaField }>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()
const value = ref('')
const error = ref<string | null>(null)

const canSave = computed(
  () => value.value.trim() !== '' && supportsStaticValue(props.targetField.dataType),
)

function save() {
  if (!supportsStaticValue(props.targetField.dataType)) return
  const result = validateStaticValue(value.value, props.targetField.dataType, {
    maxLength: props.targetField.maxLength,
  })
  if (!result.valid) {
    error.value = result.error
    return
  }
  store.setDefaultValue(props.mappingId, {
    value: value.value.trim(),
    dataType: props.targetField.dataType,
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
