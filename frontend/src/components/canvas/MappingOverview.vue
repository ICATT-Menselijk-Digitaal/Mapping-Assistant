<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { storeToRefs } from 'pinia'
import AISuggestionPanel from './AISuggestionPanel.vue'
import { useAISuggestions } from '@/composables/useAISuggestions'
import { isMappingComplete } from '@/utils/transformationCompletion'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
  activeTab?: 'koppelingen' | 'ai'
}>()

const emit = defineEmits<{
  FieldMappingRemoved: [payload: { sourceFieldId: string; targetFieldId: string }]
  'update:activeTab': ['koppelingen' | 'ai']
}>()

const store = useMappings()
const { selectedMappingId } = storeToRefs(store)
const aiStore = useAISuggestions()
const pendingDeleteId = ref<string | null>(null)
const searchQuery = ref('')
const currentTab = computed(() => props.activeTab ?? 'koppelingen')
const rowRefs = ref<Map<string, HTMLElement>>(new Map())

function setRowRef(id: string, el: HTMLElement | null) {
  if (el) rowRefs.value.set(id, el)
  else rowRefs.value.delete(id)
}

watch(selectedMappingId, async (id) => {
  if (!id) return
  await nextTick()
  rowRefs.value.get(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
})

const FALLBACK_TYPE = { bg: 'bg-slate-100', text: 'text-slate-400', label: '?' }
const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  string:  { bg: 'bg-blue-50',    text: 'text-blue-600',   label: 'str'  },
  number:  { bg: 'bg-amber-50',   text: 'text-amber-600',  label: 'num'  },
  boolean: { bg: 'bg-purple-50',  text: 'text-purple-600', label: 'bool' },
  date:    { bg: 'bg-emerald-50', text: 'text-emerald-600',label: 'date' },
  object:  { bg: 'bg-slate-100',  text: 'text-slate-500',  label: 'obj'  },
  array:   { bg: 'bg-cyan-50',    text: 'text-cyan-600',   label: 'arr'  },
  unknown: FALLBACK_TYPE,
}

function typeOf(dataType: string) {
  return typeConfig[dataType] ?? FALLBACK_TYPE
}

const rows = computed(() =>
  store.mappingsWithStatus(props.sourceSchema, props.targetSchema).map((m) => {
    const source = props.sourceSchema.byId(m.sourceFieldId)
    const target = props.targetSchema.byId(m.targetFieldId)
    const orphaned = m.orphaned === true
    return {
      id: m.id,
      sourceFieldId: m.sourceFieldId,
      targetFieldId: m.targetFieldId,
      validationStatus: m.validationStatus,
      orphaned,
      missingSource: orphaned && !source,
      missingTarget: orphaned && !target,
      source,
      target,
      isComplete: source && target ? isMappingComplete(m, source, target) : false,
    }
  }),
)

function statusIcon(row: { validationStatus: string; isComplete: boolean }): { text: string; symbol: string } {
  if (row.validationStatus === 'incompatible') return { text: 'text-red-500', symbol: '✕' }
  if (row.validationStatus === 'constrained' && !row.isComplete) return { text: 'text-amber-600', symbol: '!' }
  return { text: 'text-emerald-600', symbol: '✓' }
}

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(
    (r) =>
      (r.source?.name ?? r.sourceFieldId).toLowerCase().includes(q) ||
      (r.target?.name ?? r.targetFieldId).toLowerCase().includes(q),
  )
})

const pendingDeleteRow = computed(() =>
  pendingDeleteId.value ? rows.value.find((r) => r.id === pendingDeleteId.value) ?? null : null,
)

function requestDelete(mappingId: string) {
  pendingDeleteId.value = mappingId
}

function confirmDelete() {
  if (!pendingDeleteRow.value) return
  const { sourceFieldId, targetFieldId } = pendingDeleteRow.value
  store.removeMapping(pendingDeleteRow.value.id)
  emit('FieldMappingRemoved', { sourceFieldId, targetFieldId })
  pendingDeleteId.value = null
}

function cancelDelete() {
  pendingDeleteId.value = null
}
</script>

<template>
  <div class="flex flex-col bg-white border border-slate-200 rounded-sm overflow-hidden">
    <!-- Tab header -->
    <div class="border-b border-slate-200 flex" data-testid="tab-header">
      <button
        :class="['px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5',
          currentTab === 'koppelingen'
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-slate-500 hover:text-slate-700']"
        data-testid="tab-koppelingen"
        @click="emit('update:activeTab', 'koppelingen')"
      >
        Koppelingen
        <span class="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
          {{ store.mappings.length }}
        </span>
      </button>
      <button
        :class="['px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5',
          currentTab === 'ai'
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-slate-500 hover:text-slate-700']"
        data-testid="tab-ai"
        @click="emit('update:activeTab', 'ai')"
      >
        AI Suggesties
        <span
          v-if="aiStore.suggestions.length > 0"
          class="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-semibold"
        >{{ aiStore.suggestions.length }}</span>
      </button>
    </div>

    <!-- Search input (koppelingen tab only, when rows exist) -->
    <div
      v-if="currentTab === 'koppelingen' && rows.length > 0"
      class="px-3 py-2 border-b border-slate-100"
    >
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Zoek op veldnaam…"
        class="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400"
        data-testid="search-input"
      />
    </div>

    <!-- AI Suggesties tab -->
    <AISuggestionPanel
      v-if="currentTab === 'ai'"
      :source-schema="props.sourceSchema"
      :target-schema="props.targetSchema"
      class="flex-1 flex flex-col overflow-hidden"
    />

    <!-- Koppelingen tab: empty state (no mappings at all) -->
    <div
      v-else-if="rows.length === 0"
      class="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center text-slate-400 text-sm"
      data-testid="empty-state"
    >
      <p>Nog geen koppelingen aangemaakt.</p>
      <p class="mt-1">Selecteer een bronveld en een doelveld om te beginnen.</p>
    </div>

    <!-- Koppelingen tab: no-results state (query matches nothing) -->
    <div
      v-else-if="filteredRows.length === 0"
      class="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center text-slate-400 text-sm"
      data-testid="no-results"
    >
      <p>Geen koppelingen gevonden voor '{{ searchQuery }}'.</p>
    </div>

    <!-- Koppelingen tab: mapping rows -->
    <div v-else class="flex-1 overflow-y-auto divide-y divide-slate-100">
      <div
        v-for="row in filteredRows"
        :key="row.id"
        :ref="(el) => setRowRef(row.id, el as HTMLElement | null)"
        :class="[
          'flex flex-col gap-1 px-3 py-2 text-sm',
          row.orphaned
            ? 'cursor-default bg-amber-50/40'
            : ['cursor-pointer hover:bg-slate-50', { 'bg-indigo-50': row.id === selectedMappingId }],
        ]"
        data-testid="mapping-row"
        @click.stop="row.orphaned ? null : store.selectMapping(row.id)"
      >
        <div class="flex items-center gap-2">
          <!-- Validation status icon -->
          <span
            :class="['shrink-0 text-[11px] font-bold w-4 text-center', statusIcon(row).text]"
            data-testid="validation-status"
          >{{ statusIcon(row).symbol }}</span>

          <!-- Orphaned mapping indicator -->
          <span
            v-if="row.orphaned"
            class="shrink-0 text-amber-600 text-[13px] leading-none"
            data-testid="orphan-indicator"
            title="Verweesde koppeling: verwijst naar een niet-bestaand veld"
            aria-label="Verweesde koppeling"
          >⚠</span>

          <!-- Source field -->
          <div class="flex-1 min-w-0 flex items-center gap-1.5">
            <span class="font-mono text-slate-800 truncate text-[13px] flex-1 min-w-0">
              {{ row.source?.name ?? row.sourceFieldId }}
            </span>
            <span
              v-if="row.source"
              :class="['shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium', typeOf(row.source.dataType).bg, typeOf(row.source.dataType).text]"
            >{{ typeOf(row.source.dataType).label }}</span>
          </div>

          <!-- Arrow -->
          <span class="text-slate-300 shrink-0">→</span>

          <!-- Target field -->
          <div class="flex-1 min-w-0 flex items-center gap-1.5">
            <span class="font-mono text-slate-800 truncate text-[13px] flex-1 min-w-0">
              {{ row.target?.name ?? row.targetFieldId }}
            </span>
            <span
              v-if="row.target"
              :class="['shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium', typeOf(row.target.dataType).bg, typeOf(row.target.dataType).text]"
            >{{ typeOf(row.target.dataType).label }}</span>
          </div>

          <!-- Remove button -->
          <button
            class="shrink-0 text-slate-300 hover:text-red-500 transition-colors font-bold px-1 leading-none"
            data-testid="remove-mapping"
            aria-label="Verwijder koppeling"
            @click.stop="requestDelete(row.id)"
          >×</button>
        </div>

        <!-- Orphan details: list each missing field -->
        <div
          v-if="row.orphaned"
          class="pl-6 text-[11px] text-amber-700 space-y-0.5"
          data-testid="orphan-details"
        >
          <div v-if="row.missingSource" data-testid="orphan-missing-source">
            Bronveld niet gevonden: <span class="font-mono">{{ row.sourceFieldId }}</span>
          </div>
          <div v-if="row.missingTarget" data-testid="orphan-missing-target">
            Doelveld niet gevonden: <span class="font-mono">{{ row.targetFieldId }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirmation overlay -->
    <div
      v-if="pendingDeleteRow"
      class="fixed inset-0 flex items-center justify-center bg-black/20 z-50"
      data-testid="delete-confirmation"
    >
      <div class="bg-white rounded-lg shadow-lg px-6 py-5 max-w-xs w-full mx-4">
        <p class="text-sm text-slate-700 mb-4">
          Verwijder koppeling van
          <span class="font-mono font-semibold text-slate-900">{{ pendingDeleteRow.source?.name ?? pendingDeleteRow.sourceFieldId }}</span>
          naar
          <span class="font-mono font-semibold text-slate-900">{{ pendingDeleteRow.target?.name ?? pendingDeleteRow.targetFieldId }}</span>?
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
            @click="cancelDelete"
          >Annuleren</button>
          <button
            class="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded"
            data-testid="confirm-delete"
            @click="confirmDelete"
          >Verwijderen</button>
        </div>
      </div>
    </div>
  </div>
</template>
