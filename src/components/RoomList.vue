<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { RoomSummary } from '@/types'

defineProps<{
  connected: boolean
  rooms: RoomSummary[]
  openRooms: string[]
  unreadByRoom: Record<string, number>
  canOpenRoom: boolean
}>()

defineEmits<{
  select: [room: string]
}>()
</script>

<template>
  <aside class="flex w-44 shrink-0 flex-col bg-muted/25 sm:w-64">
    <header class="flex h-16 shrink-0 items-center gap-2 px-4">
      <span
        class="size-2 rounded-full"
        :class="connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
      />
      <span class="truncate text-sm font-semibold">Live logs</span>
    </header>

    <ScrollArea class="min-h-0 flex-1 px-2 pb-3">
      <p
        v-if="rooms.length === 0"
        class="px-2 py-6 text-xs leading-5 text-muted-foreground"
      >
        Комнаты появятся после первого подключения.
      </p>

      <Button
        v-for="room in rooms"
        :key="room.name"
        variant="ghost"
        class="mb-1 h-auto w-full justify-start gap-2 px-2.5 py-2"
        :class="openRooms.includes(room.name) && 'bg-muted'"
        :disabled="!canOpenRoom && !openRooms.includes(room.name)"
        @click="$emit('select', room.name)"
      >
        <span class="text-muted-foreground">#</span>
        <span class="min-w-0 flex-1 truncate text-left">{{ room.name }}</span>
        <span
          v-if="unreadByRoom[room.name]"
          class="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
        >
          {{ unreadByRoom[room.name] > 99 ? '99+' : unreadByRoom[room.name] }}
        </span>
        <span
          v-if="room.producers > 0"
          class="size-1.5 shrink-0 rounded-full bg-emerald-500"
          :title="`${room.producers} подключено`"
        />
      </Button>
    </ScrollArea>

    <a
      href="/events"
      class="m-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      Настройка событий
    </a>
  </aside>
</template>
