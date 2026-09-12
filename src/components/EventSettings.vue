<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import RoomList from '@/components/RoomList.vue'
import { Separator } from '@/components/ui/separator'
import type { LogContour } from '@/composables/useScreens'
import { parseLogMessage } from '@/lib/log-events'
import type { LogEntry, RoomSummary } from '@/types'

const props = defineProps<{
  connected: boolean
  contours: LogContour[]
  rooms: RoomSummary[]
  logsByRoom: Record<string, LogEntry[]>
  isEventEnabled: (room: string, event: string) => boolean
  toggleEvent: (room: string, event: string) => void
}>()

const selectedRoom = ref('')
const noUnread: Record<string, number> = {}
const roomNames = computed(() => [...new Set([
  ...props.contours.flatMap((contour) => contour.servers.flatMap((server) =>
    server.screens.flatMap((screen) => screen.rooms.map((room) => room.name)),
  )),
  ...props.rooms.map((room) => room.name),
])])

const eventStatsByRoom = computed(() => Object.fromEntries(
  roomNames.value.map((room) => {
    const roomEvents = [...new Set(
      (props.logsByRoom[room] ?? []).map((log) => parseLogMessage(log.message).event),
    )]

    return [room, {
      enabled: roomEvents.filter((event) => props.isEventEnabled(room, event)).length,
      total: roomEvents.length,
    }]
  }),
))

watch(roomNames, (rooms) => {
  if (!rooms.includes(selectedRoom.value)) selectedRoom.value = rooms[0] ?? ''
}, { immediate: true })

const selectedLocation = computed(() => {
  for (const contour of props.contours) {
    for (const server of contour.servers) {
      for (const screen of server.screens) {
        if (screen.rooms.some((room) => room.name === selectedRoom.value)) {
          return {
            contourId: contour.id,
            screenId: screen.id,
            serverId: server.id,
          }
        }
      }
    }
  }

  const contour = props.contours[0]
  const server = contour?.servers[0]
  return {
    contourId: contour?.id ?? '',
    screenId: server?.screens[0]?.id ?? '',
    serverId: server?.id ?? '',
  }
})

const events = computed(() => [
  ...new Set(
    (props.logsByRoom[selectedRoom.value] ?? []).map(
      (log) => parseLogMessage(log.message).event,
    ),
  ),
].sort())

function selectTreeRoom(_serverId: string, _screenId: string, room: string) {
  selectedRoom.value = room
}

function setAll(enabled: boolean) {
  for (const event of events.value) {
    if (props.isEventEnabled(selectedRoom.value, event) !== enabled) {
      props.toggleEvent(selectedRoom.value, event)
    }
  }
}
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-background text-foreground">
    <RoomList
      :active-contour-id="selectedLocation.contourId"
      :active-room="selectedRoom"
      :active-screen-id="selectedLocation.screenId"
      :active-server-id="selectedLocation.serverId"
      :can-open-room="true"
      :connected="connected"
      :contours="contours"
      :event-stats-by-room="eventStatsByRoom"
      mode="events"
      :rooms="rooms"
      :unread-by-room="noUnread"
      @select="selectedRoom = $event"
      @select-screen-room="selectTreeRoom"
    />

    <Separator orientation="vertical" />

    <section class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex h-16 shrink-0 items-center justify-between border-b px-5">
        <div class="min-w-0">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Комната
          </p>
          <p class="truncate text-sm font-semibold">
            {{ selectedRoom ? `# ${selectedRoom}` : 'Не выбрана' }}
          </p>
        </div>

        <div v-if="events.length" class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="setAll(true)"
          >
            Включить все
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="setAll(false)"
          >
            Выключить все
          </button>
        </div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto p-5">
        <section class="mx-auto max-w-2xl">
          <p v-if="!selectedRoom" class="py-12 text-center text-sm text-muted-foreground">
            Пока нет комнат
          </p>
          <p v-else-if="events.length === 0" class="py-12 text-center text-sm text-muted-foreground">
            В этой комнате пока нет событий
          </p>

          <div v-else class="overflow-hidden rounded-lg border">
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
                :class="isEventEnabled(selectedRoom, event) ? 'bg-primary' : 'bg-muted-foreground/30'"
              >
                <span
                  class="absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform"
                  :class="isEventEnabled(selectedRoom, event) ? 'translate-x-[18px]' : 'translate-x-0.5'"
                />
              </span>
            </button>
          </div>

          <p v-if="selectedRoom" class="mt-4 text-xs text-muted-foreground">
            Новые события включаются автоматически.
          </p>
        </section>
      </main>
    </section>
  </div>
</template>
