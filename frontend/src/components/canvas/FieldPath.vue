<script setup lang="ts">
import { computed } from 'vue'
import { highlightHtml } from '@/utils/highlightSegments'

const props = defineProps<{ path: string; highlightQuery?: string }>()
const segments = computed(() => props.path.split('.'))
</script>

<template>
  <template v-for="(segment, i) in segments" :key="i"
    ><template v-if="i > 0">.<wbr /></template
    ><span
      v-if="highlightQuery"
      v-html="highlightHtml(segment, highlightQuery, 'bg-yellow-200 text-inherit rounded')"
    /><template v-else>{{ segment }}</template></template
  >
</template>
