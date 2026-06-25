<script setup lang="ts">
/**
 * Shown when a poll found a newer version in this workspace while the user had
 * unsaved local edits. We never overwrite mid-session — the user decides when to
 * pull the remote change in.
 */
import { remoteUpdatePending, acceptRemoteUpdates } from '@/api/sync'
</script>

<template>
  <div
    v-if="remoteUpdatePending"
    data-testid="remote-update-banner"
    class="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow"
  >
    <span>Er is een nieuwere versie in deze werkruimte.</span>
    <button
      type="button"
      data-testid="remote-update-accept"
      class="shrink-0 rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
      @click="acceptRemoteUpdates"
    >
      Opnieuw laden
    </button>
  </div>
</template>
