<script setup lang="ts">
import MismatchDialogShell from './MismatchDialogShell.vue'
import FieldPath from './FieldPath.vue'

withDefaults(
  defineProps<{
    targetPath: string
    // "—" for a source-less (default-value) coupling being replaced.
    existingSourcePath: string
    newSourcePath: string
    // Where the existing coupling points; defaults to targetPath. For an
    // alternative-storage coupling being replaced (Feature #194) this is
    // "Alternatieve opslag: <naam>".
    existingTargetPath?: string
    intro?: string
  }>(),
  { existingTargetPath: undefined, intro: 'Dit doelveld heeft al een koppeling:' },
)
const emit = defineEmits<{ confirm: []; close: [] }>()
</script>

<template>
  <MismatchDialogShell
    title="Koppeling vervangen?"
    save-label="Vervangen"
    @close="emit('close')"
    @save="emit('confirm')"
  >
    <p class="text-sm text-slate-600">{{ intro }}</p>
    <p
      class="font-mono text-sm text-slate-800 break-words hyphens-none"
      data-testid="replace-existing-coupling"
    >
      <FieldPath :path="existingSourcePath" /> →
      <FieldPath :path="existingTargetPath ?? targetPath" />
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
