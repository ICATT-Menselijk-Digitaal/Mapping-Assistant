<script setup lang="ts">
import type { SchemaField } from '@/types'
import { fieldTypeBadge } from '@/utils/fieldTypeBadge'
import MismatchDialogShell from './MismatchDialogShell.vue'
import FieldPath from './FieldPath.vue'

defineProps<{ field: SchemaField }>()
const emit = defineEmits<{ confirm: []; close: [] }>()
</script>

<template>
  <MismatchDialogShell
    title="Standaardwaarde voor doelveld instellen"
    save-label="Bevestigen"
    @close="emit('close')"
    @save="emit('confirm')"
  >
    <p class="text-sm text-slate-600">
      Dit doelveld heeft geen bronveld. Wil je in plaats daarvan een standaardwaarde of
      JSONata-expressie instellen?
    </p>
    <div class="flex items-center gap-2" data-testid="default-value-confirm-field">
      <span
        class="font-mono text-sm text-[color:var(--color-destination)] flex-1 min-w-0 break-words"
      >
        <FieldPath :path="field.path" />
      </span>
      <span
        :class="[
          'shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium',
          fieldTypeBadge(field.dataType).bg,
          fieldTypeBadge(field.dataType).text,
        ]"
      >
        {{ fieldTypeBadge(field.dataType).label }}
      </span>
    </div>
  </MismatchDialogShell>
</template>
