<script setup lang="ts">
defineProps<{
  checked: boolean
  label: string
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :aria-label="label"
    class="inline-flex items-center justify-center rounded p-1"
    @click="$emit('toggle')"
  >
    <span
      class="relative block h-5 w-9 shrink-0 rounded-full transition-colors"
      :class="checked ? 'bg-primary' : 'bg-muted-foreground/30'"
    >
      <span
        class="absolute left-0.5 top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform"
        :class="checked ? 'translate-x-4' : 'translate-x-0'"
      />
    </span>
  </button>
</template>
