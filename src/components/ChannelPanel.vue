<script setup lang="ts">
import LogFeed from '@/components/LogFeed.vue'
import { Button } from '@/components/ui/button'
import type { LogEntry } from '@/types'

defineProps<{
  resizable?: boolean
  active: boolean
  canMakeFull: boolean
  firstUnreadIndex: number
  half: boolean
  logs: LogEntry[]
  room: string
}>()

defineEmits<{
  activate: []
  close: []
  readThrough: [log: LogEntry]
  toggleSize: []
}>()
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col" @pointerdown="$emit('activate')">
    <header class="relative flex h-16 shrink-0 items-center justify-between border-b px-4">
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold"># {{ room }}</h2>
        <p class="text-xs text-muted-foreground">{{ logs.length }} сообщений в памяти</p>
      </div>
      <div class="flex shrink-0 items-center">
        <Button
          v-if="resizable !== false"
          variant="ghost"
          size="icon-sm"
          :disabled="half && !canMakeFull"
          :aria-label="half ? `Развернуть комнату ${room}` : `Уменьшить комнату ${room}`"
          :title="half && !canMakeFull ? 'Сначала освободите место' : half ? 'На всю высоту' : 'На половину'"
          @click="$emit('toggleSize')"
        >
          <span class="text-xs font-medium leading-none">{{ half ? '↕' : '½' }}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="`Закрыть комнату ${room}`"
          @click="$emit('close')"
        >
          <span class="text-lg leading-none">×</span>
        </Button>
      </div>
      <span v-if="active" class="absolute inset-x-0 bottom-0 h-0.5 bg-sky-500" />
    </header>

    <LogFeed
      :active="active"
      :first-unread-index="firstUnreadIndex"
      :logs="logs"
      :room="room"
      @activate="$emit('activate')"
      @read-through="$emit('readThrough', $event)"
    />
  </section>
</template>
