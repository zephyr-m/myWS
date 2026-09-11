<script setup lang="ts">
import LogFeed from '@/components/LogFeed.vue'
import { Button } from '@/components/ui/button'
import type { LogEntry } from '@/types'

defineProps<{
  logs: LogEntry[]
  room: string
}>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col">
    <header class="flex h-16 shrink-0 items-center justify-between border-b px-4">
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold"># {{ room }}</h2>
        <p class="text-xs text-muted-foreground">{{ logs.length }} сообщений в памяти</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        :aria-label="`Закрыть комнату ${room}`"
        @click="$emit('close')"
      >
        <span class="text-lg leading-none">×</span>
      </Button>
    </header>

    <LogFeed :logs="logs" :room="room" />
  </section>
</template>
