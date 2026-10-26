<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { findCasingVariant, usedAlternativeStorageNames } from '@/domain/mappingOps'
import MismatchDialogShell from './MismatchDialogShell.vue'

const props = defineProps<{ mappingId: string; sourcePath: string }>()
const emit = defineEmits<{ close: [] }>()

const store = useMappings()

// Suggestions come from the names other couplings already use — there is no
// saved list (decision record, Feature #194). In practice there is one name,
// e.g. "PDF", so it's pre-filled and the administrator only confirms.
const suggestions = usedAlternativeStorageNames(store.mappings, props.mappingId)
const name = ref(suggestions.length === 1 ? suggestions[0]! : '')

// A pre-filled name must not look fixed (Kim's verification of #207): say it
// can be changed, and select it so typing replaces it straight away.
const hint = computed(() => {
  if (suggestions.length === 0) return null
  const inUse = `In gebruik: ${suggestions.join(', ')}.`
  return suggestions.length === 1
    ? `${inUse} Je kunt ook een andere naam typen.`
    : `${inUse} Kies er een of typ een nieuwe naam.`
})

const inputRef = ref<HTMLInputElement | null>(null)
onMounted(() => {
  inputRef.value?.focus()
  inputRef.value?.select()
})

const casingVariant = computed(() => findCasingVariant(name.value, suggestions))
const canSave = computed(() => name.value.trim() !== '')

function save() {
  if (!canSave.value) return
  store.setAlternativeStorage(props.mappingId, props.sourcePath, name.value)
  emit('close')
}
</script>

<template>
  <MismatchDialogShell
    title="Alternatieve opslag instellen"
    :can-save="canSave"
    @close="emit('close')"
    @save="save"
  >
    <label class="block text-sm">
      Naam van de alternatieve opslag
      <input
        ref="inputRef"
        v-model="name"
        type="text"
        list="alternative-storage-suggestions"
        placeholder="bijv. PDF"
        class="mt-1 block w-full border rounded px-2 py-1 text-sm"
        data-testid="alternative-storage-input"
      />
    </label>
    <p v-if="hint" class="text-xs text-slate-500" data-testid="alternative-storage-hint">
      {{ hint }}
    </p>
    <datalist id="alternative-storage-suggestions" data-testid="alternative-storage-suggestions">
      <option v-for="suggestion in suggestions" :key="suggestion" :value="suggestion" />
    </datalist>
    <p
      v-if="casingVariant"
      class="text-xs text-amber-700"
      data-testid="alternative-storage-casing-warning"
    >
      "{{ casingVariant }}" is al in gebruik. Bedoel je die? Je kunt deze schrijfwijze ook als
      nieuwe naam opslaan.
    </p>
  </MismatchDialogShell>
</template>
