<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspace } from '@/composables/useWorkspace'

const workspace = useWorkspace()
const { code } = storeToRefs(workspace)

const expanded = ref(false)
const draft = ref('')
const copied = ref(false)
const busy = ref(false)

async function copyCode() {
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // clipboard unavailable
  }
}

async function join() {
  if (busy.value) return
  busy.value = true
  try {
    const ok = await workspace.setCode(draft.value)
    if (ok) {
      draft.value = ''
      expanded.value = false
    }
  } finally {
    busy.value = false
  }
}

async function startFresh() {
  if (busy.value) return
  busy.value = true
  try {
    await workspace.regenerate()
    expanded.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="w-64 bg-white border border-slate-200 rounded-lg shadow-sm text-sm"
    data-testid="workspace-code"
  >
    <div class="flex items-center justify-between gap-2 px-3 py-2">
      <div class="min-w-0">
        <p class="text-[10px] uppercase tracking-wide text-slate-400">Werkruimte</p>
        <p class="font-mono text-slate-700 truncate" data-testid="workspace-code-value">
          {{ code }}
        </p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="px-2 py-1 text-xs rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          data-testid="workspace-code-copy"
          @click="copyCode"
        >
          {{ copied ? 'Gekopieerd' : 'Kopieer' }}
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          data-testid="workspace-code-toggle"
          @click="expanded = !expanded"
        >
          Delen
        </button>
      </div>
    </div>

    <div v-if="expanded" class="border-t border-slate-100 px-3 py-2 flex flex-col gap-2">
      <p class="text-xs text-slate-500">
        Deel deze code om op een ander apparaat dezelfde mapping te openen, of voer een code in om
        een gedeelde werkruimte te openen.
      </p>
      <form class="flex gap-1.5" @submit.prevent="join">
        <input
          v-model="draft"
          type="text"
          placeholder="Code invoeren"
          class="flex-1 min-w-0 text-xs font-mono uppercase border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          data-testid="workspace-code-input"
        />
        <button
          type="submit"
          :disabled="busy"
          class="shrink-0 px-2 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          data-testid="workspace-code-join"
        >
          Verbinden
        </button>
      </form>
      <button
        type="button"
        :disabled="busy"
        class="self-start text-xs text-slate-400 hover:text-slate-600 underline disabled:opacity-50"
        data-testid="workspace-code-new"
        @click="startFresh"
      >
        Nieuwe lege werkruimte
      </button>
    </div>
  </div>
</template>
