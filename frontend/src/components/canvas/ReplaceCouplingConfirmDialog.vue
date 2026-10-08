<script setup lang="ts">
import MismatchDialogShell from './MismatchDialogShell.vue'
import FieldPath from './FieldPath.vue'

defineProps<{
  targetPath: string
  // "—" for a source-less (default-value) coupling being replaced.
  existingSourcePath: string
  newSourcePath: string
}>()
const emit = defineEmits<{ confirm: []; close: [] }>()
</script>

<template>
  <MismatchDialogShell
    title="Koppeling vervangen?"
    save-label="Vervangen"
    @close="emit('close')"
    @save="emit('confirm')"
  >
    <p class="text-sm text-slate-600">Dit doelveld heeft al een koppeling:</p>
    <p
      class="font-mono text-sm text-slate-800 break-words hyphens-none"
      data-testid="replace-existing-coupling"
    >
      <FieldPath :path="existingSourcePath" /> → <FieldPath :path="targetPath" />
    </p>
    <p class="text-sm text-slate-600 mt-3">Wil je deze vervangen door:</p>
    <p
      class="font-mono text-sm text-slate-800 break-words hyphens-none"
      data-testid="replace-new-coupling"
    >
      <FieldPath :path="newSourcePath" /> → <FieldPath :path="targetPath" />
    </p>
  </MismatchDialogShell>
</template>
