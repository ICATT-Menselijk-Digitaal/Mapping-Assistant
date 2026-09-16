<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

// Generic two-pane resizable split. Width is always expressed as a
// percentage of the root's own width — never converted to a fixed pixel
// value — so it stays correct across browser-window resizes with no extra
// work. Deliberately has no knowledge of Mapping Assistant-specific
// concepts (schema panels, connection lines); callers wire the `resizing`
// event to whatever needs to react to a live layout change.
const props = defineProps<{
  rightWidthPct: number
  minLeftPx: number
  minRightPx: number
}>()

const emit = defineEmits<{
  'update:rightWidthPct': [pct: number]
  resizing: []
}>()

const rootEl = ref<HTMLElement | null>(null)

function clampRightPct(rawPct: number, totalWidth: number): number {
  if (totalWidth <= 0) return rawPct
  const minRightPct = props.minRightPx / totalWidth
  const maxRightPct = 1 - props.minLeftPx / totalWidth
  return Math.min(Math.max(rawPct, minRightPct), maxRightPct)
}

function onMouseMove(event: MouseEvent): void {
  const root = rootEl.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  const rawPct = (rect.right - event.clientX) / rect.width
  emit('update:rightWidthPct', clampRightPct(rawPct, rect.width))
  emit('resizing')
}

// Dragging fast enough that the mouse passes over panel text otherwise
// triggers the browser's native text-selection instead of resizing —
// suppress it on the whole page for the duration of the drag, not just on
// this component's own root, since the mouse routinely leaves it mid-drag.
function stopTextSelection(): void {
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function restoreTextSelection(): void {
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

function onMouseUp(): void {
  restoreTextSelection()
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function startDrag(event: MouseEvent): void {
  event.preventDefault()
  stopTextSelection()
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
  restoreTextSelection()
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div ref="rootEl" class="flex h-full w-full" data-testid="resizable-split">
    <div class="flex-1 min-w-0" data-testid="split-left">
      <slot name="left" />
    </div>
    <div
      class="w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-indigo-300 transition-colors"
      data-testid="resize-handle"
      @mousedown="startDrag"
    />
    <div class="shrink-0" :style="{ width: rightWidthPct * 100 + '%' }" data-testid="split-right">
      <slot name="right" />
    </div>
  </div>
</template>
