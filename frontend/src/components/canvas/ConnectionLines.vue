<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { storeToRefs } from 'pinia'

const mappingsStore = useMappings()
const { mappings, selectedMappingId } = storeToRefs(mappingsStore)

interface LineCoords {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

const lines = ref<LineCoords[]>([])
const svgRef = ref<SVGSVGElement | null>(null)
const hoveredLineId = ref<string | null>(null)

function bezierPath(line: LineCoords): string {
  const dx = (line.x2 - line.x1) * 0.4
  return `M ${line.x1} ${line.y1} C ${line.x1 + dx} ${line.y1}, ${line.x2 - dx} ${line.y2}, ${line.x2} ${line.y2}`
}

const linesWithMeta = computed(() =>
  lines.value.map((line) => ({
    ...line,
    path: bezierPath(line),
    hovered: line.id === hoveredLineId.value,
    selected: line.id === selectedMappingId.value,
  })),
)

function midPoint(el: HTMLElement, side: 'source' | 'target', svgRect: DOMRect): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return {
    x: r.left - svgRect.left + (side === 'source' ? r.width : 0),
    y: r.top - svgRect.top + r.height / 2,
  }
}

function getFieldMidY(fieldId: string, side: 'source' | 'target'): { x: number; y: number } | null {
  if (!svgRef.value) return null
  const svgRect = svgRef.value.getBoundingClientRect()

  const el = document.querySelector<HTMLElement>(
    `[data-field-id="${fieldId}"][data-field-side="${side}"]`,
  )
  if (!el) return null

  const rect = el.getBoundingClientRect()

  // Field is visible, or not inside a collapsible panel — use it directly
  if (rect.height > 0 || !el.hasAttribute('data-field-in-group'))
    return midPoint(el, side, svgRect)

  // Field is hidden inside a panel — try the parent field toggle anchor (subtree collapsed)
  const parentKey = el.getAttribute('data-child-of-field')
  if (parentKey) {
    const parentEl = document.querySelector<HTMLElement>(`[data-anchor-field="${parentKey}"]`)
    if (parentEl && parentEl.getBoundingClientRect().height > 0)
      return midPoint(parentEl, side, svgRect)
  }

  // Fall back to the group header anchor (group collapsed)
  const groupKey = el.getAttribute('data-field-in-group')
  if (groupKey) {
    const groupEl = document.querySelector<HTMLElement>(`[data-anchor-group="${groupKey}"]`)
    if (groupEl && groupEl.getBoundingClientRect().height > 0)
      return midPoint(groupEl, side, svgRect)
  }

  return null
}

function recalculate() {
  const result: LineCoords[] = []
  for (const mapping of mappings.value) {
    const start = getFieldMidY(mapping.sourceFieldId, 'source')
    const end = getFieldMidY(mapping.targetFieldId, 'target')
    if (start && end) {
      result.push({ id: mapping.id, x1: start.x, y1: start.y, x2: end.x, y2: end.y })
    }
  }
  lines.value = result
}

watch(mappings, () => nextTick(recalculate), { deep: true })

let scrollParent: HTMLElement | null = null

onMounted(() => {
  scrollParent = svgRef.value?.parentElement ?? null
  scrollParent?.addEventListener('scroll', recalculate, { capture: true, passive: true })
  recalculate()
  window.addEventListener('resize', recalculate)
  window.addEventListener('schema-panel-toggle', recalculate)
})

onUnmounted(() => {
  scrollParent?.removeEventListener('scroll', recalculate, { capture: true })
  window.removeEventListener('resize', recalculate)
  window.removeEventListener('schema-panel-toggle', recalculate)
})
</script>

<template>
  <!--
    SVG is pointer-events:none so it doesn't block field row clicks.
    Individual line groups override to pointer-events:auto for hover/click.
  -->
  <svg
    ref="svgRef"
    class="absolute inset-0 w-full h-full pointer-events-none"
    aria-hidden="true"
    data-testid="connection-lines-svg"
  >
    <g
      v-for="line in linesWithMeta"
      :key="line.id"
      style="pointer-events: auto; cursor: pointer"
      data-testid="connection-line-group"
      @mouseenter="hoveredLineId = line.id"
      @mouseleave="hoveredLineId = null"
      @click.stop="mappingsStore.selectMapping(line.id)"
    >
      <!-- Wider invisible hit area so thin lines are easy to hover and click -->
      <path :d="line.path" fill="none" stroke="transparent" stroke-width="16" />

      <!-- Visible line -->
      <path
        :d="line.path"
        fill="none"
        :stroke="line.selected ? '#4f46e5' : (line.hovered ? '#4f46e5' : '#6366f1')"
        :stroke-width="line.selected || line.hovered ? 3 : 2"
        :stroke-opacity="line.selected || line.hovered ? 1 : 0.7"
        data-testid="connection-path"
      />

      <!-- Endpoint dots -->
      <circle :cx="line.x1" :cy="line.y1" r="4" :fill="line.selected || line.hovered ? '#4f46e5' : '#6366f1'" :fill-opacity="line.selected || line.hovered ? 1 : 0.7" />
      <circle :cx="line.x2" :cy="line.y2" r="4" :fill="line.selected || line.hovered ? '#4f46e5' : '#6366f1'" :fill-opacity="line.selected || line.hovered ? 1 : 0.7" />
    </g>
  </svg>
</template>
