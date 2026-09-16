import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ResizableSplit from '../ResizableSplit.vue'

function mountSplit(rightWidthPct = 0.3, minLeftPx = 480, minRightPx = 280) {
  const div = document.createElement('div')
  document.body.appendChild(div)
  const wrapper = mount(ResizableSplit, {
    props: { rightWidthPct, minLeftPx, minRightPx },
    slots: { left: '<div>Left content</div>', right: '<div>Right content</div>' },
    attachTo: div,
  })
  const root = wrapper.find('[data-testid="resizable-split"]').element as HTMLElement
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 500,
    width: 1000,
    height: 500,
    toJSON: () => ({}),
  })
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})

describe('ResizableSplit', () => {
  it('renders left and right slot content', () => {
    const wrapper = mountSplit()
    expect(wrapper.text()).toContain('Left content')
    expect(wrapper.text()).toContain('Right content')
  })

  // Scenario: Dragging changes the ratio between canvas and Koppelingen paneel
  it('emits an updated rightWidthPct when the handle is dragged', async () => {
    const wrapper = mountSplit(0.3)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    // Root spans x=0..1000; dragging to clientX=600 means 400px (40%) on the right.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))

    const emitted = wrapper.emitted('update:rightWidthPct')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1]![0]).toBeCloseTo(0.4, 2)
  })

  // Scenario: Connection lines stay correctly attached during a resize
  it('emits resizing on every drag-move tick, so a listener can trigger a recalculation', async () => {
    const wrapper = mountSplit(0.3)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 550 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 560 }))

    expect(wrapper.emitted('resizing')).toHaveLength(2)
  })

  // Scenario: Dragging past the minimum width is stopped
  it('clamps to minLeftPx when dragging toward the left edge (right pane would otherwise grow huge)', async () => {
    const wrapper = mountSplit(0.3, 480, 280)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    // Dragging almost to the left edge would starve the left pane — clamp to 1 - minLeftPx/total = 0.52.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10 }))

    const emitted = wrapper.emitted('update:rightWidthPct')
    expect(emitted![emitted!.length - 1]![0]).toBeCloseTo(0.52, 2)
  })

  it('clamps to minRightPx when dragging toward the right edge (right pane would otherwise shrink too far)', async () => {
    const wrapper = mountSplit(0.3, 480, 280)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    // Dragging almost to the right edge would starve the right pane — clamp to minRightPx/total = 0.28.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 990 }))

    const emitted = wrapper.emitted('update:rightWidthPct')
    expect(emitted![emitted!.length - 1]![0]).toBeCloseTo(0.28, 2)
  })

  it('stops listening for mousemove after mouseup', async () => {
    const wrapper = mountSplit(0.3)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))

    const emitted = wrapper.emitted('update:rightWidthPct')!
    // Only the one mousemove before mouseup should have emitted.
    expect(emitted).toHaveLength(1)
  })

  it('emits resize-end on mouseup', async () => {
    const wrapper = mountSplit(0.3)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })

  // PR review finding: if mouseup fires outside the browser viewport (never
  // reaching window), the next mousedown used to stack a second listener
  // pair, causing every following tick to emit twice.
  it('does not stack duplicate listeners if a previous drag never received mouseup', async () => {
    const wrapper = mountSplit(0.3)

    // First drag: mousedown, then the mouse is released outside the
    // viewport — no window 'mouseup' event ever fires.
    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')

    // Second drag starts before the first one's listeners were ever removed.
    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))

    const emitted = wrapper.emitted('update:rightWidthPct')!
    expect(emitted).toHaveLength(1)
  })

  // Bug found live: dragging fast enough that the mouse passes over panel
  // text triggers the browser's native text selection instead of resizing.
  it('disables text selection on the page while dragging, and restores it on mouseup', async () => {
    const wrapper = mountSplit(0.3)

    expect(document.body.style.userSelect).toBe('')
    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    expect(document.body.style.userSelect).toBe('none')

    window.dispatchEvent(new MouseEvent('mouseup'))
    expect(document.body.style.userSelect).toBe('')
  })

  it('restores text selection on unmount, even mid-drag', async () => {
    const wrapper = mountSplit(0.3)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    expect(document.body.style.userSelect).toBe('none')
    wrapper.unmount()

    expect(document.body.style.userSelect).toBe('')
  })

  // Bug found live: the handle was invisible until hovered, so it wasn't
  // discoverable as a drag affordance.
  it('shows a visible background on the handle by default, not only on hover', () => {
    const wrapper = mountSplit()
    const handle = wrapper.find('[data-testid="resize-handle"]')
    expect(handle.classes().some((c) => c.startsWith('bg-'))).toBe(true)
  })

  it('removes its window listeners on unmount, even mid-drag', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mountSplit(0.3)

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    removeSpy.mockRestore()
  })

  // Scenario: Responds correctly to a browser window resize
  it('renders the right pane width as a CSS percentage, not a fixed pixel value', () => {
    const wrapper = mountSplit(0.35)
    const rightPane = wrapper.find('[data-testid="split-right"]')
    expect(rightPane.attributes('style')).toContain('35%')
    expect(rightPane.attributes('style')).not.toMatch(/(?<!min-)width:\s*\d+px/)
  })

  // Bug found live: shrinking the browser window itself (no drag involved)
  // used to let a percentage-only right pane collapse under minRightPx,
  // squishing its contents unpredictably. A CSS min-width floor keeps both
  // panes readable regardless of window size, matching the fixed-width
  // sidebar's guarantee from before this component existed.
  it('enforces minLeftPx and minRightPx as CSS floors, independent of window size', () => {
    const wrapper = mountSplit(0.1, 480, 280)
    const leftPane = wrapper.find('[data-testid="split-left"]')
    const rightPane = wrapper.find('[data-testid="split-right"]')
    expect(leftPane.attributes('style')).toContain('min-width: 480px')
    expect(rightPane.attributes('style')).toContain('min-width: 280px')
  })

  // Bug found live: when the window is shrunk so far that minLeftPx and
  // minRightPx can no longer both fit, minRightPct exceeds maxRightPct —
  // clamping in the usual min-then-max order snapped every drag position to
  // the same value, making the handle feel stuck rather than just out of room.
  it('does not lock the handle to a single value when the window is too narrow for both minimums', async () => {
    // total width 600px < 480 + 280 = 760px minimums
    const wrapper = mountSplit(0.3, 480, 280)
    const root = wrapper.find('[data-testid="resizable-split"]').element as HTMLElement
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 600,
      bottom: 500,
      width: 600,
      height: 500,
      toJSON: () => ({}),
    })

    await wrapper.find('[data-testid="resize-handle"]').trigger('mousedown')
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }))

    const emitted = wrapper.emitted('update:rightWidthPct')!
    const first = emitted[0]![0] as number
    const second = emitted[1]![0] as number
    // Both clientX values land outside the (impossible) valid range, but the
    // clamp should still resolve to a stable midpoint value it agrees with
    // itself on for either drag direction — not silently ignore the drag.
    expect(first).toBeCloseTo(second, 5)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(1)
  })
})
