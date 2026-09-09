<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ path: string }>()
const segments = computed(() => props.path.split('.'))
</script>

<template>
  <template v-for="(segment, i) in segments" :key="i"
    ><template v-if="i > 0">.<wbr /></template>{{ segment }}</template
  >
</template>
