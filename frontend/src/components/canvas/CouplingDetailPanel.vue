<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SchemaField } from '@/types'
import { useMappings } from '@/composables/useMappings'
import {
  getValidationStatus,
  getConstraintReasons,
  getIncompatibilityReason,
} from '@/utils/validationStatus'

const props = defineProps<{
  sourceFields: SchemaField[]
  targetFields: SchemaField[]
}>()

const store = useMappings()

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

function findField(fields: SchemaField[], id: string): SchemaField | null {
  for (const f of fields) {
    if (f.id === id) return f
    if (f.children) {
      const found = findField(f.children, id)
      if (found) return found
    }
  }
  return null
}

const selectedMapping = computed(() =>
  store.selectedMappingId
    ? store.mappings.find((m) => m.id === store.selectedMappingId) ?? null
    : null,
)

const sourceField = computed(() =>
  selectedMapping.value
    ? findField(props.sourceFields, selectedMapping.value.sourceFieldId)
    : null,
)

const targetField = computed(() =>
  selectedMapping.value
    ? findField(props.targetFields, selectedMapping.value.targetFieldId)
    : null,
)

const validationStatus = computed(() =>
  sourceField.value && targetField.value
    ? getValidationStatus(sourceField.value, targetField.value)
    : null,
)

const constraintReasons = computed(() =>
  sourceField.value && targetField.value && validationStatus.value === 'constrained'
    ? getConstraintReasons(sourceField.value, targetField.value)
    : [],
)

const incompatibilityReason = computed(() =>
  sourceField.value && targetField.value && validationStatus.value === 'incompatible'
    ? getIncompatibilityReason(sourceField.value, targetField.value)
    : null,
)

// Truncation form state
const truncationInput = ref(0)
const isEditing = ref(false)

const showTruncationForm = computed(() =>
  validationStatus.value === 'constrained' &&
  sourceField.value?.dataType === 'string' &&
  targetField.value?.dataType === 'string' &&
  targetField.value?.maxLength !== undefined,
)

const truncationRule = computed(
  () => selectedMapping.value?.transformations.find((r) => r.type === 'truncate') ?? null,
)

const hasTruncationRule = computed(() => truncationRule.value !== null)

const truncationError = computed(() => {
  const val = truncationInput.value
  const max = targetField.value?.maxLength
  if (!Number.isInteger(val) || val < 4) return 'Waarde moet minimaal 4 zijn'
  if (max !== undefined && val > max) return `Waarde moet tussen 4 en ${max} liggen`
  return null
})

// Default value form state
const defaultValueInput = ref('')
const isEditingDefaultValue = ref(false)

const showDefaultValueForm = computed(() =>
  validationStatus.value === 'constrained' &&
  !sourceField.value?.required &&
  targetField.value?.required === true,
)

const defaultRule = computed(
  () => selectedMapping.value?.transformations.find((r) => r.type === 'default') ?? null,
)

const hasDefaultValueRule = computed(() => defaultRule.value !== null)

const defaultValueInputType = computed(() =>
  targetField.value?.dataType === 'number' ? 'number' : 'text',
)

const defaultValueError = computed(() => {
  // String() guards against Vue auto-converting type="number" input values to numbers
  const val = String(defaultValueInput.value ?? '').trim()
  if (!val) return 'Voer een standaardwaarde in'
  if (targetField.value?.dataType === 'number' && !isFinite(Number(val))) {
    return 'Voer een geldig getal in'
  }
  return null
})

// Date format section state
const sourceDateFormatInput = ref('yyyy-MM-dd')
const targetDateFormatInput = ref('yyyy-MM-dd')
const isEditingDateFormat = ref(false)

const showDateFormatSection = computed(() =>
  sourceField.value?.dataType === 'date' &&
  targetField.value?.dataType === 'date',
)

const dateFormatRule = computed(
  () => selectedMapping.value?.transformations.find((r) => r.type === 'date-format') ?? null,
)

const hasDateFormatRule = computed(() => dateFormatRule.value !== null)

const dateFormatError = computed(() => {
  if (!sourceDateFormatInput.value.trim()) return 'Voer een bronformaat in'
  if (!targetDateFormatInput.value.trim()) return 'Voer een doelformaat in'
  return null
})

watch(selectedMapping, () => {
  if (showTruncationForm.value) {
    truncationInput.value = truncationRule.value?.truncationMaxLength ?? (targetField.value?.maxLength ?? 0)
    isEditing.value = false
  }
  if (showDefaultValueForm.value) {
    defaultValueInput.value = defaultRule.value?.defaultValue ?? ''
    isEditingDefaultValue.value = false
  }
  if (showDateFormatSection.value) {
    sourceDateFormatInput.value = dateFormatRule.value?.sourceDateFormat ?? 'yyyy-MM-dd'
    targetDateFormatInput.value = dateFormatRule.value?.targetDateFormat ?? 'yyyy-MM-dd'
    isEditingDateFormat.value = false
  }
}, { immediate: true })

function saveTruncation() {
  if (truncationError.value || !selectedMapping.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'truncate',
    truncationMaxLength: truncationInput.value,
  })
  isEditing.value = false
}

function editTruncation() {
  truncationInput.value = truncationRule.value?.truncationMaxLength ?? (targetField.value?.maxLength ?? 0)
  isEditing.value = true
}

function saveDefaultValue() {
  if (defaultValueError.value || !selectedMapping.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'default',
    defaultValue: String(defaultValueInput.value ?? '').trim(),
  })
  isEditingDefaultValue.value = false
}

function editDefaultValue() {
  defaultValueInput.value = defaultRule.value?.defaultValue ?? ''
  isEditingDefaultValue.value = true
}

// Type casting section state
const showCastSection = computed(() =>
  validationStatus.value === 'constrained' &&
  sourceField.value !== null &&
  targetField.value !== null &&
  sourceField.value!.dataType !== targetField.value!.dataType,
)

const castRule = computed(
  () => selectedMapping.value?.transformations.find((r) => r.type === 'cast') ?? null,
)

const hasCastRule = computed(() => castRule.value !== null)

function saveCast() {
  if (!selectedMapping.value || !sourceField.value || !targetField.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'cast',
    castFrom: sourceField.value.dataType,
    castTo: targetField.value.dataType,
  })
}

function removeCast() {
  if (!selectedMapping.value) return
  store.removeTransformation(selectedMapping.value.id, 'cast')
}

function saveDateFormat() {
  if (dateFormatError.value || !selectedMapping.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'date-format',
    sourceDateFormat: sourceDateFormatInput.value.trim(),
    targetDateFormat: targetDateFormatInput.value.trim(),
  })
  isEditingDateFormat.value = false
}

function editDateFormat() {
  sourceDateFormatInput.value = dateFormatRule.value?.sourceDateFormat ?? 'yyyy-MM-dd'
  targetDateFormatInput.value = dateFormatRule.value?.targetDateFormat ?? 'yyyy-MM-dd'
  isEditingDateFormat.value = true
}
</script>

<template>
  <div
    v-if="selectedMapping && sourceField && targetField"
    class="flex flex-col bg-white border border-slate-200 rounded-sm overflow-hidden"
    data-testid="coupling-detail-panel"
  >
    <!-- Header -->
    <div class="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
      <span class="text-sm font-medium text-slate-700">Koppelingsdetail</span>
      <button
        class="text-slate-400 hover:text-slate-600 transition-colors leading-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 rounded"
        data-testid="detail-close"
        aria-label="Close coupling detail"
        @click="store.selectMapping(null)"
      >×</button>
    </div>

    <!-- Source field -->
    <div class="px-4 pt-4 pb-2" data-testid="detail-source-field">
      <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Bronveld</p>
      <div class="flex items-center gap-2">
        <span class="font-mono text-sm text-[color:var(--color-source)] truncate flex-1">
          {{ sourceField.name }}
        </span>
        <span :class="['shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium', typeOf(sourceField.dataType).bg, typeOf(sourceField.dataType).text]">
          {{ typeOf(sourceField.dataType).label }}
        </span>
        <span v-if="sourceField.required" class="shrink-0 bg-rose-50 text-rose-600 text-[10px] rounded px-1 font-medium">REQ</span>
      </div>
      <p v-if="sourceField.dataType === 'string' && sourceField.maxLength" class="text-[11px] text-slate-400 mt-0.5">
        max. {{ sourceField.maxLength }}
      </p>
    </div>

    <!-- Arrow separator -->
    <div class="px-4 py-1 text-center text-slate-300 text-xs">→</div>

    <!-- Target field -->
    <div class="px-4 pt-2 pb-4" data-testid="detail-target-field">
      <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Doelveld</p>
      <div class="flex items-center gap-2">
        <span class="font-mono text-sm text-[color:var(--color-destination)] truncate flex-1">
          {{ targetField.name }}
        </span>
        <span :class="['shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium', typeOf(targetField.dataType).bg, typeOf(targetField.dataType).text]">
          {{ typeOf(targetField.dataType).label }}
        </span>
        <span v-if="targetField.required" class="shrink-0 bg-rose-50 text-rose-600 text-[10px] rounded px-1 font-medium">REQ</span>
      </div>
      <p v-if="targetField.dataType === 'string' && targetField.maxLength" class="text-[11px] text-slate-400 mt-0.5">
        max. {{ targetField.maxLength }}
      </p>
    </div>

    <!-- Validation section -->
    <div
      class="mx-4 mb-4 rounded p-3 text-sm"
      :class="{
        'bg-emerald-50 text-emerald-700': validationStatus === 'compatible',
        'bg-amber-50 text-amber-700': validationStatus === 'constrained',
        'bg-red-50 text-red-700': validationStatus === 'incompatible',
      }"
      role="status"
      data-testid="detail-validation-section"
    >
      <!-- Compatible -->
      <template v-if="validationStatus === 'compatible'">
        <span class="font-medium">✓ Koppeling is compatibel.</span>
      </template>

      <!-- Constrained -->
      <template v-else-if="validationStatus === 'constrained'">
        <span v-for="(reason, i) in constraintReasons" :key="i" class="block font-medium">⚠ {{ reason }}</span>

        <!-- Truncation form (string→string with target maxLength) -->
        <template v-if="showTruncationForm">
          <!-- Read-only summary -->
          <div
            v-if="hasTruncationRule && !isEditing"
            class="mt-2 flex items-center justify-between gap-2"
            data-testid="truncation-summary"
          >
            <span class="text-sm text-amber-700">
              ✂ Afkappen op {{ truncationRule?.truncationMaxLength }} tekens
              ({{ (truncationRule?.truncationMaxLength ?? 3) - 3 }} + "...")
            </span>
            <button
              class="text-xs text-amber-700 underline shrink-0"
              data-testid="truncation-edit"
              @click="editTruncation"
            >Wijzigen</button>
          </div>

          <!-- Form (fresh or edit) -->
          <form
            v-else
            role="form"
            aria-label="Truncatieregel instellen"
            class="mt-2"
            data-testid="truncation-form"
            @submit.prevent="saveTruncation"
          >
            <label class="block text-[11px] text-amber-700 mb-1">Maximale uitvoerlengte</label>
            <div class="flex items-center gap-2">
              <input
                v-model.number="truncationInput"
                type="number"
                :min="4"
                :max="targetField.maxLength"
                class="w-24 border border-amber-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                aria-label="Maximale uitvoerlengte"
                :aria-describedby="truncationError ? 'truncation-error-msg' : undefined"
                data-testid="truncation-input"
              />
              <button
                type="button"
                :disabled="!!truncationError"
                class="bg-amber-600 text-white rounded px-3 py-1 text-xs hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                :aria-disabled="!!truncationError"
                data-testid="truncation-save"
                @click="saveTruncation"
              >Opslaan</button>
            </div>
            <p
              v-if="truncationError"
              id="truncation-error-msg"
              class="mt-1 text-[11px] text-red-600"
              data-testid="truncation-error"
            >{{ truncationError }}</p>
            <p v-else class="mt-1 text-[11px] text-slate-400">
              Uitvoer: {{ truncationInput - 3 }} tekens + "..."
            </p>
          </form>
        </template>

        <!-- Default value form (non-required source → required target) -->
        <template v-if="showDefaultValueForm">
          <!-- Read-only summary -->
          <div
            v-if="hasDefaultValueRule && !isEditingDefaultValue"
            class="mt-2 flex items-center justify-between gap-2"
            data-testid="default-value-summary"
          >
            <span class="text-sm text-amber-700">↩ Standaardwaarde: {{ defaultRule?.defaultValue }}</span>
            <button
              class="text-xs text-amber-700 underline shrink-0"
              data-testid="default-value-edit"
              @click="editDefaultValue"
            >Wijzigen</button>
          </div>

          <!-- Form (fresh or edit) -->
          <form
            v-else
            role="form"
            aria-label="Standaardwaarde instellen"
            class="mt-2"
            data-testid="default-value-form"
            @submit.prevent="saveDefaultValue"
          >
            <label class="block text-[11px] text-amber-700 mb-1">Standaardwaarde <span aria-hidden="true">*</span></label>
            <div class="flex items-center gap-2">
              <input
                v-model="defaultValueInput"
                :type="defaultValueInputType"
                required
                class="flex-1 border border-amber-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                aria-label="Standaardwaarde"
                :aria-describedby="defaultValueError ? 'default-value-error-msg' : undefined"
                data-testid="default-value-input"
              />
              <button
                type="button"
                :disabled="!!defaultValueError"
                class="bg-amber-600 text-white rounded px-3 py-1 text-xs hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                :aria-disabled="!!defaultValueError"
                data-testid="default-value-save"
                @click="saveDefaultValue"
              >Opslaan</button>
            </div>
            <p
              v-if="defaultValueError"
              id="default-value-error-msg"
              class="mt-1 text-[11px] text-red-600"
              data-testid="default-value-error"
            >{{ defaultValueError }}</p>
          </form>
        </template>

        <!-- Type casting section (different-type constrained couplings) -->
        <template v-if="showCastSection">
          <!-- Read-only summary -->
          <div
            v-if="hasCastRule"
            class="mt-2 flex items-center justify-between gap-2"
            data-testid="cast-summary"
          >
            <span class="text-sm text-amber-700">⇄ {{ castRule?.castFrom }} wordt omgezet naar {{ castRule?.castTo }}</span>
            <button
              class="text-xs text-amber-700 underline shrink-0"
              data-testid="cast-edit"
              @click="removeCast"
            >Wijzigen</button>
          </div>

          <!-- Confirm section -->
          <div v-else class="mt-2" data-testid="cast-section">
            <p class="text-sm text-amber-700 mb-1">{{ sourceField.dataType }} wordt omgezet naar {{ targetField.dataType }}</p>
            <button
              type="button"
              class="bg-amber-600 text-white rounded px-3 py-1 text-xs hover:bg-amber-700"
              data-testid="cast-confirm"
              @click="saveCast"
            >Bevestig type casting</button>
          </div>
        </template>
      </template>

      <!-- Incompatible -->
      <template v-else-if="validationStatus === 'incompatible'">
        <span class="font-medium">✕ {{ incompatibilityReason }}</span>
        <p class="mt-1 text-xs" data-testid="remap-note">Deze koppeling moet opnieuw worden gemaakt.</p>
      </template>
    </div>

    <!-- Date format section (date → date couplings, any validation status) -->
    <div
      v-if="showDateFormatSection"
      class="mx-4 mb-4 rounded p-3 text-sm bg-emerald-50 text-emerald-700"
    >
      <!-- Read-only summary -->
      <div
        v-if="hasDateFormatRule && !isEditingDateFormat"
        class="flex items-center justify-between gap-2"
        data-testid="date-format-summary"
      >
        <span class="text-sm text-emerald-700">📅 {{ dateFormatRule?.sourceDateFormat }} → {{ dateFormatRule?.targetDateFormat }}</span>
        <button
          class="text-xs text-emerald-700 underline shrink-0"
          data-testid="date-format-edit"
          @click="editDateFormat"
        >Wijzigen</button>
      </div>

      <!-- Form (fresh or edit) -->
      <form
        v-else
        role="form"
        aria-label="Datumformaat instellen"
        data-testid="date-format-form"
        @submit.prevent="saveDateFormat"
      >
        <label class="block text-[11px] text-emerald-700 mb-1">Bronformaat</label>
        <input
          v-model="sourceDateFormatInput"
          type="text"
          class="w-full border border-emerald-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 mb-2"
          aria-label="Bronformaat"
          data-testid="source-format-input"
        />
        <label class="block text-[11px] text-emerald-700 mb-1">Doelformaat</label>
        <input
          v-model="targetDateFormatInput"
          type="text"
          class="w-full border border-emerald-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 mb-2"
          aria-label="Doelformaat"
          data-testid="target-format-input"
        />
        <p
          v-if="dateFormatError"
          class="mt-1 text-[11px] text-red-600"
          data-testid="date-format-error"
        >{{ dateFormatError }}</p>
        <p v-else class="text-[11px] text-slate-400 mb-1">
          Veelgebruikte notaties: dd-MM-yyyy, yyyy-MM-dd, MM/dd/yyyy, ISO 8601
        </p>
        <button
          type="button"
          :disabled="!!dateFormatError"
          class="bg-emerald-600 text-white rounded px-3 py-1 text-xs hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :aria-disabled="!!dateFormatError"
          data-testid="date-format-save"
          @click="saveDateFormat"
        >Opslaan</button>
      </form>
    </div>
  </div>
</template>
