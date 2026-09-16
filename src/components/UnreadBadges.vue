<script setup lang="ts">
defineProps<{ normal?: number; errors?: number }>()
</script>

<template>
  <span v-if="normal || errors" class="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold leading-none">
    <span v-if="normal" class="rounded-full bg-sky-500 px-1.5 py-0.5 text-white" :title="`Непрочитанные уведомления: ${normal}`" :aria-label="`Непрочитанные уведомления: ${normal}`">{{ normal }}</span>
    <span v-if="errors" class="rounded-full bg-red-500 px-1.5 py-0.5 text-white" :title="`Непрочитанные ошибки: ${errors}`" :aria-label="`Непрочитанные ошибки: ${errors}`">{{ errors }}</span>
  </span>
</template>
