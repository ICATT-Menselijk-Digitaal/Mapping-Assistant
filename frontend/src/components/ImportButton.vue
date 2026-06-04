<script setup lang="ts">
import { ref } from 'vue'

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
  <div>
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
