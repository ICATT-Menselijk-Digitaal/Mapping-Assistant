<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  error?: string | null
  warnings?: readonly string[]
}>()

const emit = defineEmits<{
  (e: 'file-selected', file: File): void
  (e: 'dismiss-error'): void
  (e: 'dismiss-warnings'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const AUTO_DISMISS_MS = 5000
let errorTimer: ReturnType<typeof setTimeout> | null = null
let warningsTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.error,
  (next) => {
    if (errorTimer) clearTimeout(errorTimer)
    if (next) errorTimer = setTimeout(() => emit('dismiss-error'), AUTO_DISMISS_MS)
  },
  { immediate: true },
)

watch(
  () => props.warnings,
  (next) => {
    if (warningsTimer) clearTimeout(warningsTimer)
    if (next && next.length > 0)
      warningsTimer = setTimeout(() => emit('dismiss-warnings'), AUTO_DISMISS_MS)
  },
  { immediate: true },
)

function openPicker() {
  inputRef.value?.click()
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('file-selected', file)
  input.value = ''
}
</script>

<template>
  <div>
    <Teleport to="body">
      <div
        v-if="error || (warnings && warnings.length > 0)"
        class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        data-testid="import-toast-container"
      >
        <div class="flex flex-col items-center gap-2 pointer-events-auto">
          <div
            v-if="error"
            class="max-w-md text-sm bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-start gap-3"
            role="alert"
            data-testid="import-error"
          >
            <span class="flex-1">{{ error }}</span>
            <button
              type="button"
              class="text-red-400 hover:text-red-600 font-bold leading-none"
              aria-label="Sluiten"
              data-testid="import-error-dismiss"
              @click="emit('dismiss-error')"
            >×</button>
          </div>
          <div
            v-if="warnings && warnings.length > 0"
            class="max-w-md text-sm bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg shadow-lg flex items-start gap-3"
            role="status"
            data-testid="import-warning"
          >
            <ul class="flex-1 list-disc list-inside space-y-0.5">
              <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
            </ul>
            <button
              type="button"
              class="text-amber-500 hover:text-amber-700 font-bold leading-none"
              aria-label="Sluiten"
              data-testid="import-warning-dismiss"
              @click="emit('dismiss-warnings')"
            >×</button>
          </div>
        </div>
      </div>
    </Teleport>
    <input
      ref="inputRef"
      type="file"
      accept="application/json,.json"
      class="hidden"
      data-testid="import-file-input"
      @change="onChange"
    />
    <button
      type="button"
      class="px-4 py-2 text-sm font-medium bg-white border border-slate-300 text-slate-700 rounded-lg shadow-lg hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
      @click="openPicker"
    >
      Importeer koppelingsset
    </button>
  </div>
</template>
