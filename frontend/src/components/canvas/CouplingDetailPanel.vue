<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import jsonata from 'jsonata'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useTransformationSuggestions } from '@/composables/useTransformationSuggestions'
import {
  getValidationStatus,
  getIncompatibilityReason,
} from '@/utils/validationStatus'
import { isRuleComplete, getRequiredRuleTypes } from '@/utils/transformationCompletion'
import type { TransformationType } from '@/types/mapping'
import type { TransformationSuggestion } from '@/types/ai'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
}>()

const store = useMappings()
const suggestionsStore = useTransformationSuggestions()

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

const selectedMapping = computed(() =>
  store.selectedMappingId
    ? store.mappings.find((m) => m.id === store.selectedMappingId) ?? null
    : null,
)

const sourceField = computed(() =>
  selectedMapping.value
    ? props.sourceSchema.byId(selectedMapping.value.sourceFieldId) ?? null
    : null,
)

const targetField = computed(() =>
  selectedMapping.value
    ? props.targetSchema.byId(selectedMapping.value.targetFieldId) ?? null
    : null,
)

const validationStatus = computed(() =>
  sourceField.value && targetField.value
    ? getValidationStatus(sourceField.value, targetField.value)
    : null,
)

const incompatibilityReason = computed(() =>
  sourceField.value && targetField.value && validationStatus.value === 'incompatible'
    ? getIncompatibilityReason(sourceField.value, targetField.value)
    : null,
)

// Required rule types for the current mapping (excluding 'direct')
const requiredRuleTypes = computed(() =>
  sourceField.value && targetField.value
    ? getRequiredRuleTypes(sourceField.value, targetField.value).filter((t) => t !== 'direct')
    : [],
)

// ── Per-mismatch mode & expression state ──────────────────────────────────────

type MismatchMode = 'structured' | 'expression'

const expressionModes = ref<Partial<Record<TransformationType, MismatchMode>>>({})
const expressionInputs = ref<Partial<Record<TransformationType, string>>>({})
const expressionErrors = ref<Partial<Record<TransformationType, string>>>({})
const suggestionLoadingTypes = ref(new Set<TransformationType>())

function getModeForType(ruleType: TransformationType): MismatchMode {
  if (ruleType in expressionModes.value) return expressionModes.value[ruleType]!
  const hasExpression = selectedMapping.value?.transformations.some(
    (r) => r.type === 'expression' && r.replaces === ruleType,
  ) ?? false
  return hasExpression ? 'expression' : 'structured'
}

function isStructuredRuleComplete(ruleType: TransformationType): boolean {
  const rule = selectedMapping.value?.transformations.find((r) => r.type === ruleType)
  return rule !== undefined && isRuleComplete(rule)
}

function isExpressionRuleComplete(ruleType: TransformationType): boolean {
  const rule = selectedMapping.value?.transformations.find(
    (r) => r.type === 'expression' && r.replaces === ruleType,
  )
  return rule !== undefined && isRuleComplete(rule)
}

function isTypeResolved(ruleType: TransformationType): boolean {
  return isStructuredRuleComplete(ruleType) || isExpressionRuleComplete(ruleType)
}

function setMode(ruleType: TransformationType, mode: MismatchMode) {
  expressionModes.value = { ...expressionModes.value, [ruleType]: mode }
  if (mode === 'expression' && !(ruleType in expressionInputs.value)) {
    const existing = selectedMapping.value?.transformations.find(
      (r) => r.type === 'expression' && r.replaces === ruleType,
    )
    expressionInputs.value = { ...expressionInputs.value, [ruleType]: existing?.expression ?? '' }
  }
}

function getMismatchLabel(ruleType: TransformationType): string {
  if (!sourceField.value || !targetField.value) return ruleType
  switch (ruleType) {
    case 'truncate':
      return `Tekst te lang (bron max. ${sourceField.value.maxLength ?? '∞'}, doel max. ${targetField.value.maxLength})`
    case 'default':
      return 'Bronveld is optioneel, doelveld is verplicht'
    case 'cast':
      return `Type omzetting: ${sourceField.value.dataType} → ${targetField.value.dataType}`
    case 'date-format':
      return 'Datumformaat conversie'
    default:
      return ruleType
  }
}

function saveExpression(ruleType: TransformationType) {
  const expr = expressionInputs.value[ruleType]?.trim()
  if (!expr || !selectedMapping.value) return
  try {
    jsonata(expr)
  } catch (e) {
    const raw = (e != null && typeof (e as Record<string, unknown>).message === 'string')
      ? (e as Record<string, unknown>).message as string
      : String(e)
    const msg = `De expressie is incorrect (${raw})`
    expressionErrors.value = { ...expressionErrors.value, [ruleType]: msg }
    return
  }
  expressionErrors.value = { ...expressionErrors.value, [ruleType]: undefined }
  store.updateTransformation(selectedMapping.value.id, {
    type: 'expression',
    expression: expr,
    replaces: ruleType,
  })
  // Remove the structural rule for this type to keep them mutually exclusive
  store.removeTransformation(selectedMapping.value.id, ruleType)
}

async function suggestForType(ruleType: TransformationType) {
  if (!selectedMapping.value || !sourceField.value || !targetField.value) return
  suggestionLoadingTypes.value = new Set(suggestionLoadingTypes.value).add(ruleType)
  await suggestionsStore.generateSuggestion({
    mappingId: selectedMapping.value.id,
    sourceField: sourceField.value,
    targetField: targetField.value,
    ruleType,
  })
  const allSuggestions = suggestionsStore.generatedSuggestions[selectedMapping.value.id] ?? []
  const matched = findSuggestionForType(ruleType, allSuggestions)
  if (matched?.expression) {
    expressionInputs.value = { ...expressionInputs.value, [ruleType]: matched.expression }
  }
  const next = new Set(suggestionLoadingTypes.value)
  next.delete(ruleType)
  suggestionLoadingTypes.value = next
}

function findSuggestionForType(
  ruleType: TransformationType,
  suggestions: TransformationSuggestion[],
): TransformationSuggestion | null {
  if (!suggestions.length) return null
  const keywords: Partial<Record<TransformationType, string[]>> = {
    truncate: ['length', 'truncat', 'lengte', 'lang'],
    default: ['required', 'optioneel', 'default', 'verplicht'],
    cast: ['type', 'cast', 'omzet'],
    'date-format': ['date', 'datum', 'format'],
  }
  const kw = keywords[ruleType] ?? []
  return (
    suggestions.find((s) => kw.some((k) => s.mismatch.toLowerCase().includes(k))) ??
    suggestions[0] ??
    null
  )
}

// ── Truncation form state ─────────────────────────────────────────────────────

const truncationInput = ref(0)
const isEditing = ref(false)

const truncationRule = computed(
  () => selectedMapping.value?.transformations.find((r): r is { type: 'truncate'; truncationMaxLength?: number } => r.type === 'truncate') ?? null,
)

const truncationComplete = computed(() => truncationRule.value !== null && isRuleComplete(truncationRule.value))

const truncationError = computed(() => {
  const val = truncationInput.value
  const max = targetField.value?.maxLength
  if (!Number.isInteger(val) || val < 4) return 'Waarde moet minimaal 4 zijn'
  if (max !== undefined && val > max) return `Waarde moet tussen 4 en ${max} liggen`
  return null
})

function saveTruncation() {
  if (truncationError.value || !selectedMapping.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'truncate',
    truncationMaxLength: truncationInput.value,
  })
  store.removeTransformation(selectedMapping.value.id, 'expression', 'truncate')
  isEditing.value = false
}

function editTruncation() {
  truncationInput.value = truncationRule.value?.truncationMaxLength ?? (targetField.value?.maxLength ?? 0)
  isEditing.value = true
}

// ── Default value form state ──────────────────────────────────────────────────

const defaultValueInput = ref('')
const isEditingDefaultValue = ref(false)

const defaultRule = computed(
  () => selectedMapping.value?.transformations.find((r): r is { type: 'default'; defaultValue?: string } => r.type === 'default') ?? null,
)

const defaultValueComplete = computed(() => defaultRule.value !== null && isRuleComplete(defaultRule.value))

const defaultValueInputType = computed(() =>
  targetField.value?.dataType === 'number' ? 'number' : 'text',
)

const defaultValueError = computed(() => {
  const val = String(defaultValueInput.value ?? '').trim()
  if (!val) return 'Voer een standaardwaarde in'
  if (targetField.value?.dataType === 'number' && !isFinite(Number(val))) {
    return 'Voer een geldig getal in'
  }
  return null
})

function saveDefaultValue() {
  if (defaultValueError.value || !selectedMapping.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'default',
    defaultValue: String(defaultValueInput.value ?? '').trim(),
  })
  store.removeTransformation(selectedMapping.value.id, 'expression', 'default')
  isEditingDefaultValue.value = false
}

function editDefaultValue() {
  defaultValueInput.value = defaultRule.value?.defaultValue ?? ''
  isEditingDefaultValue.value = true
}

// ── Date format section state ─────────────────────────────────────────────────

const sourceDateFormatInput = ref('yyyy-MM-dd')
const targetDateFormatInput = ref('yyyy-MM-dd')
const isEditingDateFormat = ref(false)

const dateFormatRule = computed(
  () => selectedMapping.value?.transformations.find((r): r is { type: 'date-format'; sourceDateFormat?: string; targetDateFormat?: string } => r.type === 'date-format') ?? null,
)

const dateFormatComplete = computed(() => dateFormatRule.value !== null && isRuleComplete(dateFormatRule.value))

const dateFormatError = computed(() => {
  if (!sourceDateFormatInput.value.trim()) return 'Voer een bronformaat in'
  if (!targetDateFormatInput.value.trim()) return 'Voer een doelformaat in'
  return null
})

function saveDateFormat() {
  if (dateFormatError.value || !selectedMapping.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'date-format',
    sourceDateFormat: sourceDateFormatInput.value.trim(),
    targetDateFormat: targetDateFormatInput.value.trim(),
  })
  store.removeTransformation(selectedMapping.value.id, 'expression', 'date-format')
  isEditingDateFormat.value = false
}

function editDateFormat() {
  sourceDateFormatInput.value = dateFormatRule.value?.sourceDateFormat ?? 'yyyy-MM-dd'
  targetDateFormatInput.value = dateFormatRule.value?.targetDateFormat ?? 'yyyy-MM-dd'
  isEditingDateFormat.value = true
}

// ── Type casting state ────────────────────────────────────────────────────────

const castRule = computed(
  () => selectedMapping.value?.transformations.find((r): r is { type: 'cast'; castFrom?: string; castTo?: string } => r.type === 'cast') ?? null,
)

const castComplete = computed(() => castRule.value !== null && isRuleComplete(castRule.value))

function saveCast() {
  if (!selectedMapping.value || !sourceField.value || !targetField.value) return
  store.updateTransformation(selectedMapping.value.id, {
    type: 'cast',
    castFrom: sourceField.value.dataType,
    castTo: targetField.value.dataType,
  })
  store.removeTransformation(selectedMapping.value.id, 'expression', 'cast')
}

function removeCast() {
  if (!selectedMapping.value) return
  store.updateTransformation(selectedMapping.value.id, { type: 'cast' })
}

// ── Watchers ──────────────────────────────────────────────────────────────────

watch(
  selectedMapping,
  () => {
    expressionModes.value = {}
    expressionInputs.value = {}
    expressionErrors.value = {}
    if (truncationRule.value) {
      truncationInput.value = truncationRule.value?.truncationMaxLength ?? (targetField.value?.maxLength ?? 0)
      isEditing.value = false
    }
    if (defaultRule.value) {
      defaultValueInput.value = defaultRule.value?.defaultValue ?? ''
      isEditingDefaultValue.value = false
    }
    if (dateFormatRule.value) {
      sourceDateFormatInput.value = dateFormatRule.value?.sourceDateFormat ?? 'yyyy-MM-dd'
      targetDateFormatInput.value = dateFormatRule.value?.targetDateFormat ?? 'yyyy-MM-dd'
      isEditingDateFormat.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="selectedMapping && sourceField && targetField"
    class="flex flex-col bg-white border border-slate-200 rounded-sm overflow-hidden max-h-full"
    data-testid="coupling-detail-panel"
  >
    <!-- Header -->
    <div class="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
      <span class="text-sm font-medium text-slate-700">Koppelingsdetail</span>
      <button
        class="text-slate-400 hover:text-slate-600 transition-colors leading-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 rounded"
        data-testid="detail-close"
        aria-label="Close coupling detail"
        @click="store.selectMapping(null)"
      >×</button>
    </div>

    <!-- Scrollable body -->
    <div class="overflow-y-auto min-h-0 flex-1">

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

      <!-- Validation status badge -->
      <div
        class="mx-4 mb-3 rounded px-3 py-2 text-sm"
        :class="{
          'bg-emerald-50 text-emerald-700': validationStatus === 'compatible' && requiredRuleTypes.length === 0,
          'bg-amber-50 text-amber-700': validationStatus === 'constrained' || requiredRuleTypes.length > 0,
          'bg-red-50 text-red-700': validationStatus === 'incompatible',
        }"
        role="status"
        data-testid="detail-validation-section"
      >
        <template v-if="validationStatus === 'compatible' && requiredRuleTypes.length === 0">
          <span class="font-medium">✓ Koppeling is compatibel.</span>
        </template>
        <template v-else-if="validationStatus === 'incompatible'">
          <span class="font-medium">✕ {{ incompatibilityReason }}</span>
          <p class="mt-1 text-xs" data-testid="remap-note">Deze koppeling moet opnieuw worden gemaakt.</p>
        </template>
        <template v-else>
          <span class="font-medium text-amber-700">⚠ Transformatie vereist</span>
        </template>
      </div>

      <!-- Per-mismatch sections -->
      <template v-if="requiredRuleTypes.length > 0 && validationStatus !== 'incompatible'">
        <div
          v-for="ruleType in requiredRuleTypes"
          :key="ruleType"
          class="mx-4 mb-3 rounded border border-slate-200 overflow-hidden"
          :data-testid="`mismatch-section-${ruleType}`"
        >
          <!-- Section header -->
          <div class="px-3 py-2 flex items-center justify-between bg-slate-50 border-b border-slate-200">
            <span class="text-xs font-medium text-slate-700">{{ getMismatchLabel(ruleType) }}</span>
            <span
              :class="isTypeResolved(ruleType) ? 'text-emerald-600' : 'text-amber-600'"
              class="text-[10px] font-medium shrink-0 ml-2"
              :data-testid="`mismatch-status-${ruleType}`"
            >{{ isTypeResolved(ruleType) ? '✓ Opgelost' : '● Vereist' }}</span>
          </div>

          <!-- Mode toggle -->
          <div class="flex border-b border-slate-200 text-xs">
            <button
              :class="getModeForType(ruleType) === 'structured'
                ? 'bg-white text-slate-700 font-medium border-b-2 border-violet-500'
                : 'text-slate-400 hover:text-slate-600 bg-slate-50'"
              class="flex-1 px-3 py-1.5 transition-colors"
              :data-testid="`mode-structured-${ruleType}`"
              @click="setMode(ruleType, 'structured')"
            ><span v-if="isStructuredRuleComplete(ruleType)" class="mr-1">✓</span>Configureren</button>
            <button
              :class="getModeForType(ruleType) === 'expression'
                ? 'bg-white text-slate-700 font-medium border-b-2 border-violet-500'
                : 'text-slate-400 hover:text-slate-600 bg-slate-50'"
              class="flex-1 px-3 py-1.5 border-l border-slate-200 transition-colors"
              :data-testid="`mode-expression-${ruleType}`"
              @click="setMode(ruleType, 'expression')"
            ><span v-if="isExpressionRuleComplete(ruleType)" class="mr-1">✓</span>Expressie</button>
          </div>

          <!-- Structured content -->
          <div v-if="getModeForType(ruleType) === 'structured'" class="p-3">

            <!-- Truncation -->
            <template v-if="ruleType === 'truncate'">
              <div
                v-if="truncationComplete && !isEditing"
                class="flex items-center justify-between gap-2"
                data-testid="truncation-summary"
              >
                <span class="text-sm text-slate-700">
                  ✂ Afkappen op {{ truncationRule?.truncationMaxLength }} tekens
                  ({{ (truncationRule?.truncationMaxLength ?? 3) - 3 }} + "...")
                </span>
                <button
                  class="text-xs text-amber-700 underline shrink-0"
                  data-testid="truncation-edit"
                  @click="editTruncation"
                >Wijzigen</button>
              </div>
              <form
                v-else
                role="form"
                aria-label="Truncatieregel instellen"
                data-testid="truncation-form"
                @submit.prevent="saveTruncation"
              >
                <label class="block text-[11px] text-slate-500 mb-1">Maximale uitvoerlengte</label>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="truncationInput"
                    type="number"
                    :min="4"
                    :max="targetField.maxLength"
                    class="w-24 border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
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

            <!-- Default value -->
            <template v-else-if="ruleType === 'default'">
              <div
                v-if="defaultValueComplete && !isEditingDefaultValue"
                class="flex items-center justify-between gap-2"
                data-testid="default-value-summary"
              >
                <span class="text-sm text-slate-700">↩ Standaardwaarde: {{ defaultRule?.defaultValue }}</span>
                <button
                  class="text-xs text-amber-700 underline shrink-0"
                  data-testid="default-value-edit"
                  @click="editDefaultValue"
                >Wijzigen</button>
              </div>
              <form
                v-else
                role="form"
                aria-label="Standaardwaarde instellen"
                data-testid="default-value-form"
                @submit.prevent="saveDefaultValue"
              >
                <label class="block text-[11px] text-slate-500 mb-1">Standaardwaarde <span aria-hidden="true">*</span></label>
                <div class="flex items-center gap-2">
                  <input
                    v-model="defaultValueInput"
                    :type="defaultValueInputType"
                    required
                    class="flex-1 border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
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

            <!-- Type casting -->
            <template v-else-if="ruleType === 'cast'">
              <div
                v-if="castComplete"
                class="flex items-center justify-between gap-2"
                data-testid="cast-summary"
              >
                <span class="text-sm text-slate-700">⇄ {{ castRule?.castFrom }} wordt omgezet naar {{ castRule?.castTo }}</span>
                <button
                  class="text-xs text-amber-700 underline shrink-0"
                  data-testid="cast-edit"
                  @click="removeCast"
                >Wijzigen</button>
              </div>
              <div v-else data-testid="cast-section">
                <p class="text-sm text-slate-700 mb-2">{{ sourceField.dataType }} wordt omgezet naar {{ targetField.dataType }}</p>
                <button
                  type="button"
                  class="bg-amber-600 text-white rounded px-3 py-1 text-xs hover:bg-amber-700"
                  data-testid="cast-confirm"
                  @click="saveCast"
                >Bevestig type casting</button>
              </div>
            </template>

            <!-- Date format -->
            <template v-else-if="ruleType === 'date-format'">
              <div
                v-if="dateFormatComplete && !isEditingDateFormat"
                class="flex items-center justify-between gap-2"
                data-testid="date-format-summary"
              >
                <span class="text-sm text-slate-700">📅 {{ dateFormatRule?.sourceDateFormat }} → {{ dateFormatRule?.targetDateFormat }}</span>
                <button
                  class="text-xs text-emerald-700 underline shrink-0"
                  data-testid="date-format-edit"
                  @click="editDateFormat"
                >Wijzigen</button>
              </div>
              <form
                v-else
                role="form"
                aria-label="Datumformaat instellen"
                data-testid="date-format-form"
                @submit.prevent="saveDateFormat"
              >
                <label class="block text-[11px] text-slate-500 mb-1">Bronformaat</label>
                <input
                  v-model="sourceDateFormatInput"
                  type="text"
                  class="w-full border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 mb-2"
                  aria-label="Bronformaat"
                  data-testid="source-format-input"
                />
                <label class="block text-[11px] text-slate-500 mb-1">Doelformaat</label>
                <input
                  v-model="targetDateFormatInput"
                  type="text"
                  class="w-full border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 mb-2"
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
            </template>

          </div>

          <!-- Expression content -->
          <div v-else class="p-3" :data-testid="`expression-section-${ruleType}`">
            <textarea
              v-model="expressionInputs[ruleType]"
              rows="3"
              :class="expressionErrors[ruleType] ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-violet-400'"
              class="w-full font-mono text-xs border rounded px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-1 resize-none"
              aria-label="JSONata expressie"
              placeholder="JSONata expressie…"
              :data-testid="`expression-input-${ruleType}`"
              @input="expressionErrors[ruleType] = undefined"
            />
            <div class="flex gap-2 mt-1.5 items-center flex-wrap">
              <button
                type="button"
                :disabled="!expressionInputs[ruleType]?.trim()"
                class="bg-violet-600 text-white rounded px-3 py-1 text-xs hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                :data-testid="`expression-save-${ruleType}`"
                @click="saveExpression(ruleType)"
              >Opslaan</button>
              <button
                type="button"
                :disabled="suggestionLoadingTypes.has(ruleType)"
                class="border border-violet-300 text-violet-700 rounded px-3 py-1 text-xs hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed"
                :data-testid="`expression-suggest-${ruleType}`"
                @click="suggestForType(ruleType)"
              >{{ suggestionLoadingTypes.has(ruleType) ? 'Laden…' : 'Suggestie via AI' }}</button>
            </div>
            <p
              v-if="expressionErrors[ruleType]"
              class="mt-1.5 text-[11px] text-red-600 font-mono break-all"
              :data-testid="`expression-error-${ruleType}`"
            >{{ expressionErrors[ruleType] }}</p>
            <p
              v-else-if="isExpressionRuleComplete(ruleType)"
              class="mt-1.5 text-[11px] text-emerald-600"
              :data-testid="`expression-resolved-${ruleType}`"
            >✓ Expressie opgeslagen</p>
          </div>

        </div>
      </template>

    </div><!-- end scrollable body -->
  </div>
</template>
