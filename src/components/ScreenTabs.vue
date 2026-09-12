<script setup lang="ts">
import type { LogScreen } from '@/composables/useScreens'

defineProps<{
  activeScreenId: string
  screens: LogScreen[]
}>()

defineEmits<{
  close: [screenId: string]
  select: [screenId: string]
}>()
</script>

<template>
  <nav class="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/25 px-1 pt-1" aria-label="Открытые экраны">
    <div
      v-for="screen in screens"
      :key="screen.id"
      class="group relative flex min-w-28 max-w-52 shrink-0 items-center rounded-t-md border border-b-0"
      :class="activeScreenId === screen.id ? 'bg-background' : 'bg-muted/50 hover:bg-muted/80'"
    >
      <button
        type="button"
        class="min-w-0 flex-1 truncate py-2 pl-3 text-left text-xs"
        :title="screen.name"
        @click="$emit('select', screen.id)"
      >
        {{ screen.name }}
      </button>
      <button
        v-if="screens.length > 1"
        type="button"
        class="mr-1 grid size-6 shrink-0 place-items-center rounded text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :aria-label="`Закрыть вкладку ${screen.name}`"
        @click="$emit('close', screen.id)"
      >
        ×
      </button>
      <span
        v-if="activeScreenId === screen.id"
        class="absolute inset-x-0 bottom-0 h-0.5 bg-sky-500"
      />
    </div>
  </nav>
</template>
