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

function onMouseUp(): void {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function startDrag(): void {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
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
      class="w-1 shrink-0 cursor-col-resize hover:bg-indigo-200 transition-colors"
      data-testid="resize-handle"
      @mousedown="startDrag"
    />
    <div class="shrink-0" :style="{ width: rightWidthPct * 100 + '%' }" data-testid="split-right">
      <slot name="right" />
    </div>
  </div>
</template>
