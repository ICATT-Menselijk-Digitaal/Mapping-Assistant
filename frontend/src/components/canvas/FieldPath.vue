<script setup lang="ts">
import { computed } from 'vue'
import { highlightPathSegments } from '@/utils/highlightSegments'

const MARK_CLASS = 'bg-yellow-200 text-inherit rounded'

const props = defineProps<{ path: string; highlightQuery?: string }>()
const segments = computed(() => props.path.split('.'))
const highlightedSegments = computed(() =>
  props.highlightQuery ? highlightPathSegments(props.path, props.highlightQuery, MARK_CLASS) : null,
)
</script>

<template>
  <template v-for="(segment, i) in segments" :key="i"
    ><template v-if="i > 0">.<wbr /></template
    ><span v-if="highlightedSegments" v-html="highlightedSegments[i]" /><template v-else>{{
      segment
    }}</template></template
  >
</template>
