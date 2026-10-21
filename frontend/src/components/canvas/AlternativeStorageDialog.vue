<script setup lang="ts">
import { ref, computed } from 'vue'
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
        v-model="name"
        type="text"
        list="alternative-storage-suggestions"
        placeholder="bijv. PDF"
        class="mt-1 block w-full border rounded px-2 py-1 text-sm"
        data-testid="alternative-storage-input"
      />
    </label>
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
