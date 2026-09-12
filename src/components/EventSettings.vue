<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseLogMessage } from '@/lib/log-events'
import type { LogEntry, RoomSummary } from '@/types'

const props = defineProps<{
  rooms: RoomSummary[]
  logsByRoom: Record<string, LogEntry[]>
  isEventEnabled: (room: string, event: string) => boolean
  toggleEvent: (room: string, event: string) => void
}>()

const selectedRoom = ref('')

watch(
  () => props.rooms,
  (rooms) => {
    if (!rooms.some((room) => room.name === selectedRoom.value)) {
      selectedRoom.value = rooms[0]?.name ?? ''
    }
  },
  { immediate: true },
)

const events = computed(() => [
  ...new Set(
    (props.logsByRoom[selectedRoom.value] ?? []).map(
      (log) => parseLogMessage(log.message).event,
    ),
  ),
].sort())
</script>

<template>
  <div class="flex h-dvh flex-col bg-background text-foreground">
    <header class="flex h-16 shrink-0 items-center justify-between border-b px-5">
      <span class="text-sm font-semibold">Настройка событий</span>
      <a href="/" class="text-sm text-muted-foreground hover:text-foreground">← Панель</a>
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto p-5">
      <section class="mx-auto max-w-xl">
        <label for="room" class="mb-2 block text-xs font-medium text-muted-foreground">
          Комната
        </label>
        <select
          id="room"
          v-model="selectedRoom"
          class="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option v-for="room in rooms" :key="room.name" :value="room.name">
            {{ room.name }}
          </option>
        </select>

        <p v-if="!selectedRoom" class="py-12 text-center text-sm text-muted-foreground">
          Пока нет комнат
        </p>
        <p v-else-if="events.length === 0" class="py-12 text-center text-sm text-muted-foreground">
          В этой комнате пока нет событий
        </p>

        <div v-else class="mt-6 overflow-hidden rounded-lg border">
          <button
            v-for="event in events"
            :key="event"
            type="button"
            role="switch"
            :aria-checked="isEventEnabled(selectedRoom, event)"
            class="flex w-full items-center justify-between gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
            @click="toggleEvent(selectedRoom, event)"
          >
            <span class="truncate font-mono text-sm">{{ event }}</span>
            <span
              class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
              :class="isEventEnabled(selectedRoom, event) ? 'bg-primary' : 'bg-muted-foreground/25'"
            >
              <span
                class="absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform"
                :class="isEventEnabled(selectedRoom, event) ? 'translate-x-[18px]' : 'translate-x-0.5'"
              />
            </span>
          </button>
        </div>
      </section>
    </main>
  </div>
</template>
