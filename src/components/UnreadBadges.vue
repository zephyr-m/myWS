<script setup lang="ts">
import { useEventKinds } from '@/composables/useEventKinds'
import { badgeTextColor, type KindCounts } from '@/lib/event-types'
defineProps<{ counts?: KindCounts }>()
const { types } = useEventKinds()
</script>

<template>
  <span class="inline-flex shrink-0 flex-wrap items-center gap-1 text-[10px] font-semibold leading-none">
    <template v-for="kind in types" :key="kind.id">
      <span v-if="counts?.[kind.id]" class="rounded-full px-1.5 py-0.5"
        :style="{ backgroundColor: kind.color, color: badgeTextColor(kind.color) }"
        :title="`${kind.name}: ${counts[kind.id]}`" :aria-label="`Непрочитанные · ${kind.name}: ${counts[kind.id]}`">{{ counts[kind.id] }}</span>
    </template>
  </span>
</template>
