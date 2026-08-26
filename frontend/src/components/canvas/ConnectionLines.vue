<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useMappings } from '@/composables/useMappings'
import { storeToRefs } from 'pinia'

const mappingsStore = useMappings()
const { mappings, selectedMappingId, hoveredMappingId, hoveredFieldId, hoveredFieldSide } =
  storeToRefs(mappingsStore)

interface LineCoords {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface DotCoords {
  key: string
  x: number
  y: number
}

const lines = ref<LineCoords[]>([])
const dots = ref<DotCoords[]>([])
const svgRef = ref<SVGSVGElement | null>(null)

function bezierPath(line: LineCoords): string {
  const dx = (line.x2 - line.x1) * 0.4
  return `M ${line.x1} ${line.y1} C ${line.x1 + dx} ${line.y1}, ${line.x2 - dx} ${line.y2}, ${line.x2} ${line.y2}`
}

// A mapping is "focused" when it is selected, hovered directly, or one of
// its own fields is hovered in the schema panel — any of these should make
// its line stand out and dim every other line.
const focusedMappingIds = computed(() => {
  const ids = new Set<string>()
  if (selectedMappingId.value) ids.add(selectedMappingId.value)
  if (hoveredMappingId.value) ids.add(hoveredMappingId.value)
  if (hoveredFieldId.value && hoveredFieldSide.value) {
    for (const m of mappings.value) {
      const matches =
        hoveredFieldSide.value === 'source'
          ? m.sourceFieldId === hoveredFieldId.value
          : m.targetFieldId === hoveredFieldId.value
      if (matches) ids.add(m.id)
    }
  }
  return ids
})

const linesWithMeta = computed(() =>
  lines.value.map((line) => {
    const focused = focusedMappingIds.value.has(line.id)
    const dimmed = focusedMappingIds.value.size > 0 && !focused
    return {
      ...line,
      path: bezierPath(line),
      focused,
      dimmed,
      selected: line.id === selectedMappingId.value,
    }
  }),
)

function midPoint(
  el: HTMLElement,
  side: 'source' | 'target',
  svgRect: DOMRect,
): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return {
    x: r.left - svgRect.left + (side === 'source' ? r.width : 0),
    y: r.top - svgRect.top + r.height / 2,
  }
}

// The x-coordinate for an anchor (collapsed-object fallback) position must
// come from the schema panel's own container edge, not from the anchor row
// itself — a row can be narrower than the panel (e.g. a scope checkbox
// shrinks the group toggle button), which used to land lines/dots on top of
// that checkbox instead of in the gutter between panels.
function panelEdgeX(fromEl: HTMLElement, side: 'source' | 'target', svgRect: DOMRect): number {
  const panelEl = fromEl.closest<HTMLElement>('[data-scroll-container]')
  if (!panelEl) return midPoint(fromEl, side, svgRect).x
  const panelRect = panelEl.getBoundingClientRect()
  return side === 'source' ? panelRect.right - svgRect.left : panelRect.left - svgRect.left
}

interface FieldPosition {
  x: number
  y: number
  // Set to the anchor's identifying key (e.g. "source:adres") when this
  // position was resolved via the collapsed-object fallback rather than the
  // field's own visible row. Two positions that both have an anchorKey mean
  // both endpoints of a mapping are hidden behind a collapsed object.
  anchorKey: string | null
}

function getFieldMidY(fieldId: string, side: 'source' | 'target'): FieldPosition | null {
  if (!svgRef.value) return null
  const svgRect = svgRef.value.getBoundingClientRect()

  const el = document.querySelector<HTMLElement>(
    `[data-field-id="${fieldId}"][data-field-side="${side}"]`,
  )
  if (!el) return null

  const rect = el.getBoundingClientRect()

  // Field is visible, or not inside a collapsible panel — use it directly
  if (rect.height > 0 || !el.hasAttribute('data-field-in-group')) {
    return { ...midPoint(el, side, svgRect), anchorKey: null }
  }

  // Field is hidden inside a panel — try the parent field toggle anchor (subtree collapsed)
  const parentKey = el.getAttribute('data-child-of-field')
  if (parentKey) {
    const parentEl = document.querySelector<HTMLElement>(`[data-anchor-field="${parentKey}"]`)
    if (parentEl && parentEl.getBoundingClientRect().height > 0) {
      const anchorRect = parentEl.getBoundingClientRect()
      return {
        x: panelEdgeX(el, side, svgRect),
        y: anchorRect.top - svgRect.top + anchorRect.height / 2,
        anchorKey: parentKey,
      }
    }
  }

  // Fall back to the group header anchor (group collapsed)
  const groupKey = el.getAttribute('data-field-in-group')
  if (groupKey) {
    const groupEl = document.querySelector<HTMLElement>(`[data-anchor-group="${groupKey}"]`)
    if (groupEl && groupEl.getBoundingClientRect().height > 0) {
      const anchorRect = groupEl.getBoundingClientRect()
      return {
        x: panelEdgeX(el, side, svgRect),
        y: anchorRect.top - svgRect.top + anchorRect.height / 2,
        anchorKey: groupKey,
      }
    }
  }

  return null
}

function recalculate() {
  const result: LineCoords[] = []
  const dotsByKey = new Map<string, DotCoords>()

  for (const mapping of mappings.value) {
    const start = getFieldMidY(mapping.sourceFieldId, 'source')
    const end = getFieldMidY(mapping.targetFieldId, 'target')
    if (!start || !end) continue

    // Both endpoints hidden behind a collapsed object: no line — replace
    // with (deduplicated) dots at each side's anchor instead.
    if (start.anchorKey && end.anchorKey) {
      if (!dotsByKey.has(start.anchorKey)) {
        dotsByKey.set(start.anchorKey, { key: start.anchorKey, x: start.x, y: start.y })
      }
      if (!dotsByKey.has(end.anchorKey)) {
        dotsByKey.set(end.anchorKey, { key: end.anchorKey, x: end.x, y: end.y })
      }
      continue
    }

    // Exactly one side collapsed (or neither) — unchanged behavior: draw
    // the line, converging at the collapsed side's anchor if applicable.
    result.push({ id: mapping.id, x1: start.x, y1: start.y, x2: end.x, y2: end.y })
  }

  lines.value = result
  dots.value = Array.from(dotsByKey.values())
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
      :data-dimmed="line.dimmed"
      @mouseenter="mappingsStore.hoverMapping(line.id)"
      @mouseleave="mappingsStore.hoverMapping(null)"
      @click.stop="mappingsStore.selectMapping(line.id)"
    >
      <!-- Wider invisible hit area so thin lines are easy to hover and click -->
      <path :d="line.path" fill="none" stroke="transparent" stroke-width="16" />

      <!-- Visible line -->
      <path
        :d="line.path"
        fill="none"
        :stroke="line.focused ? '#4f46e5' : '#6366f1'"
        :stroke-width="line.focused ? 3 : 2"
        :stroke-opacity="line.focused ? 1 : line.dimmed ? 0.15 : 0.7"
        data-testid="connection-path"
      />

      <!-- Endpoint dots -->
      <circle
        :cx="line.x1"
        :cy="line.y1"
        r="4"
        :fill="line.focused ? '#4f46e5' : '#6366f1'"
        :fill-opacity="line.focused ? 1 : line.dimmed ? 0.15 : 0.7"
      />
      <circle
        :cx="line.x2"
        :cy="line.y2"
        r="4"
        :fill="line.focused ? '#4f46e5' : '#6366f1'"
        :fill-opacity="line.focused ? 1 : line.dimmed ? 0.15 : 0.7"
      />
    </g>

    <!-- One dot per collapsed object that has a mapped field whose
         counterpart is also hidden behind a collapsed object on the other
         side — replaces what would otherwise be a line with no visible
         open endpoint on either end. -->
    <circle
      v-for="dot in dots"
      :key="dot.key"
      :cx="dot.x"
      :cy="dot.y"
      r="4"
      fill="#6366f1"
      data-testid="collapsed-mapping-dot"
    />
  </svg>
</template>
