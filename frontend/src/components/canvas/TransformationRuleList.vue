<script setup lang="ts">
import { ref, computed } from 'vue'
import jsonata from 'jsonata'
import type { TransformationRule } from '@/types/mapping'
import { useMappings } from '@/composables/useMappings'

const props = defineProps<{
  rules: TransformationRule[]
  mappingId: string
}>()

const store = useMappings()

const conflictTypes = computed(() => {
  const counts = new Map<string, number>()
  for (const rule of props.rules) {
    if (rule.resolvesMismatch) {
      counts.set(rule.resolvesMismatch, (counts.get(rule.resolvesMismatch) ?? 0) + 1)
    }
  }
  const conflicts = new Set<string>()
  for (const [type, count] of counts) {
    if (count > 1) conflicts.add(type)
  }
  return conflicts
})

function hasConflict(rule: TransformationRule): boolean {
  return rule.resolvesMismatch !== undefined && conflictTypes.value.has(rule.resolvesMismatch)
}

function deleteRule(ruleId: string) {
  store.removeTransformationRule(props.mappingId, ruleId)
}

const SOURCE_BADGE: Record<string, string> = {
  manual: 'bg-slate-100 text-slate-600',
  'mismatch-solution': 'bg-amber-50 text-amber-700',
  ai: 'bg-violet-50 text-violet-700',
}

function sourceLabel(source: string): string {
  if (source === 'manual') return 'handmatig'
  if (source === 'mismatch-solution') return 'oplossing'
  if (source === 'ai') return 'AI'
  return source
}

const showEditor = ref(false)
const exprInput = ref('')
const exprError = ref('')

function openEditor() {
  showEditor.value = true
  exprInput.value = ''
  exprError.value = ''
}

function cancelEditor() {
  showEditor.value = false
  exprError.value = ''
}

function saveExpression() {
  const expr = exprInput.value.trim()
  if (!expr) return
  try {
    jsonata(expr)
  } catch (e) {
    const msg =
      e != null && typeof (e as Record<string, unknown>).message === 'string'
        ? (e as Record<string, unknown>).message as string
        : String(e)
    exprError.value = `Ongeldige expressie: ${msg}`
    return
  }
  exprError.value = ''
  store.addTransformationRule(props.mappingId, {
    expression: expr,
    label: expr.length > 40 ? expr.slice(0, 37) + '...' : expr,
    source: 'manual',
  })
  showEditor.value = false
  exprInput.value = ''
}
</script>

<template>
  <div data-testid="transformation-rule-list">
    <div
      v-for="rule in rules"
      :key="rule.id"
      class="flex items-start justify-between gap-2 px-3 py-2 border border-slate-200 rounded mb-1"
      :data-testid="`rule-card-${rule.id}`"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span
            v-if="hasConflict(rule)"
            class="text-amber-500 shrink-0"
            title="Twee regels lossen hetzelfde probleem op"
            data-testid="conflict-warning"
          >⚠</span>
          <span class="text-xs text-slate-700 font-medium truncate">{{ rule.label }}</span>
          <span :class="['text-[10px] px-1 rounded shrink-0', SOURCE_BADGE[rule.source] ?? 'bg-slate-100 text-slate-600']">
            {{ sourceLabel(rule.source) }}
          </span>
        </div>
        <p class="text-[11px] text-slate-400 font-mono truncate mt-0.5">{{ rule.expression }}</p>
      </div>
      <button
        class="text-slate-400 hover:text-red-500 shrink-0 text-xs mt-0.5"
        :data-testid="`rule-delete-${rule.id}`"
        @click="deleteRule(rule.id)"
      >✕</button>
    </div>

    <p v-if="rules.length === 0" class="text-[11px] text-slate-400 italic px-1 mb-1">
      Geen regels ingesteld.
    </p>

    <div v-if="!showEditor" class="mt-1">
      <button
        class="text-xs text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 rounded px-2 py-1 w-full"
        data-testid="add-expression-btn"
        @click="openEditor"
      >+ Expressie toevoegen</button>
    </div>

    <div v-else class="mt-1 border border-slate-200 rounded p-2 space-y-1.5" data-testid="expression-editor">
      <textarea
        v-model="exprInput"
        rows="3"
        :class="exprError ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-violet-400'"
        class="w-full font-mono text-xs border rounded px-2 py-1 resize-none focus:outline-none focus:ring-1"
        placeholder="JSONata expressie…"
        data-testid="expression-input"
        @input="exprError = ''"
      />
      <p
        v-if="exprError"
        class="text-[11px] text-red-600 font-mono break-all"
        data-testid="expression-error"
      >{{ exprError }}</p>
      <div class="flex gap-2">
        <button
          class="text-xs bg-violet-600 text-white rounded px-2 py-0.5 hover:bg-violet-700 disabled:opacity-50"
          :disabled="!exprInput.trim()"
          data-testid="expression-save-btn"
          @click="saveExpression"
        >Opslaan</button>
        <button
          class="text-xs border border-slate-300 rounded px-2 py-0.5 hover:bg-slate-50"
          data-testid="expression-cancel-btn"
          @click="cancelEditor"
        >Annuleren</button>
      </div>
    </div>
  </div>
</template>
