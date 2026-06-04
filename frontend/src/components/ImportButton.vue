<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  error?: string | null
  warnings?: readonly string[]
}>()

const emit = defineEmits<{ (e: 'file-selected', file: File): void }>()

const inputRef = ref<HTMLInputElement | null>(null)

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
  <div class="flex flex-col items-end gap-2">
    <div
      v-if="error"
      class="max-w-xs text-sm bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg shadow"
      role="alert"
      data-testid="import-error"
    >
      {{ error }}
    </div>
    <div
      v-if="warnings && warnings.length > 0"
      class="max-w-xs text-sm bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg shadow"
      role="status"
      data-testid="import-warning"
    >
      <ul class="list-disc list-inside space-y-0.5">
        <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
      </ul>
    </div>
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
