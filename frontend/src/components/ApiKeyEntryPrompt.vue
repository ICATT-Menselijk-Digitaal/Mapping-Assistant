<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApiKey } from '@/composables/useApiKey'

const { isPromptVisible, provideKey, cancel, isValidating, validateKey } = useApiKey()

const inputValue = ref('')
const validationError = ref<string | null>(null)
const headingId = 'api-key-prompt-heading'

async function onConfirm() {
  if (!inputValue.value.trim() || isValidating.value) return
  validationError.value = null

  const result = await validateKey(inputValue.value.trim())

  if (result === 'valid') {
    provideKey(inputValue.value.trim())
    inputValue.value = ''
  } else if (result === 'invalid') {
    validationError.value =
      'Dit is geen geldige API-sleutel. Controleer je sleutel en probeer opnieuw.'
  } else {
    validationError.value =
      'Kon de sleutel niet valideren. Controleer je internetverbinding en probeer opnieuw.'
  }
}

function onCancel() {
  cancel()
  inputValue.value = ''
  validationError.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') onCancel()
}

watch(isPromptVisible, (visible) => {
  if (visible) {
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isPromptVisible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="api-key-overlay"
    >
      <div
        role="dialog"
        :aria-modal="true"
        :aria-labelledby="headingId"
        class="bg-white border border-slate-200 rounded-lg shadow-xl p-6 w-full max-w-md mx-4 text-sm"
        data-testid="api-key-dialog"
      >
        <p :id="headingId" class="font-semibold text-foreground mb-2">
          Voer je OpenRouter API-sleutel in
        </p>
        <p class="text-muted-foreground mb-4">
          Voor AI-suggesties heb je een persoonlijke API-sleutel nodig. Haal hem op via
          openrouter.ai/keys.
        </p>
        <input
          v-model="inputValue"
          type="text"
          placeholder="sk-or-..."
          class="block w-full border border-slate-200 rounded px-2 py-1 text-sm mb-2 focus-visible:ring-2 focus-visible:outline-none"
          data-testid="api-key-input"
          autofocus
        />
        <p
          v-if="validationError"
          class="text-red-600 text-xs mb-3"
          data-testid="api-key-error"
        >
          {{ validationError }}
        </p>
        <div v-else class="mb-3" />
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50"
            data-testid="api-key-cancel"
            @click="onCancel"
          >
            Annuleren
          </button>
          <button
            :disabled="!inputValue.trim() || isValidating"
            :aria-disabled="!inputValue.trim() || isValidating"
            class="px-3 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="api-key-confirm"
            @click="onConfirm"
          >
            <span v-if="isValidating" data-testid="api-key-loading">Valideren...</span>
            <span v-else>Bevestigen →</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
