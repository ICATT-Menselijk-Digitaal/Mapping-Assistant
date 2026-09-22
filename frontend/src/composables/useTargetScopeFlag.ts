import { computed } from 'vue'

// A single-route SPA: changing the URL always means a full reload, so this
// only needs to reflect the query string at mount time, not react to
// in-page navigation.
export function useTargetScopeFlag() {
  const targetScopeEnabled = computed(
    () => new URLSearchParams(window.location.search).get('targetScope') === '1',
  )

  return { targetScopeEnabled }
}
