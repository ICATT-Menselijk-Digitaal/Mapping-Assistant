<script setup lang="ts">
/**
 * Shared markup for the four mismatch-resolution dialogs. Owns the outer
 * container, header, and footer buttons; the dialog's own form fields
 * (and any preview) go in the default slot.
 */
withDefaults(
  defineProps<{
    title: string
    canSave?: boolean
    saveLabel?: string
  }>(),
  { canSave: true, saveLabel: 'Opslaan' },
)
const emit = defineEmits<{ close: []; save: [] }>()
</script>

<template>
  <div class="p-4 space-y-3">
    <h3 class="font-medium text-sm">{{ title }}</h3>
    <slot />
    <div class="flex gap-2 justify-end">
      <button
        data-testid="cancel-button"
        class="px-3 py-1 text-sm border rounded"
        @click="emit('close')"
      >
        Annuleren
      </button>
      <button
        data-testid="save-button"
        class="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-40"
        :disabled="!canSave"
        @click="emit('save')"
      >
        {{ saveLabel }}
      </button>
    </div>
  </div>
</template>
