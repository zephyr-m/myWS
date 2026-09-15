<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEventRoutes } from '@/composables/useEventRoutes'
import EventToggle from '@/components/EventToggle.vue'
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
  isNotificationEnabled: (room: string, event: string) => boolean
  isRoomNotificationEnabled: (room: string) => boolean
  toggleEvent: (room: string, event: string) => void
  toggleNotification: (room: string, event: string) => void
  toggleRoomNotifications: (room: string) => void
}>()

const { routes, busy, error, loaded, setRoute } = useEventRoutes()

let requestedRoom = new URLSearchParams(window.location.search).get('room') ?? ''
const selectedRoom = ref(requestedRoom)
const noUnread: Record<string, number> = {}
const roomNames = computed(() => [...new Set([
  ...props.contours.flatMap((contour) => contour.servers.flatMap((server) =>
    server.rooms,
  )),
  ...props.rooms.map((room) => room.name),
  ...routes.value.flatMap((rule) => [rule.source, rule.target]),
])])

const listedRooms = computed(() => roomNames.value.map((name) =>
  props.rooms.find((room) => room.name === name) ?? { name, producers: 0 }))

function eventRows(room: string) {
  const rows = new Map<string, { source: string; event: string }>()
  const add = (source: string, event: string) => rows.set(JSON.stringify([source, event]), { source, event })
  for (const log of props.logsByRoom[room] ?? []) add(log.sourceRoom ?? room, parseLogMessage(log.message).event)
  for (const rule of routes.value) {
    if (rule.source === room || rule.target === room) add(rule.source, rule.event)
  }
  return [...rows.values()].sort((a, b) => a.event.localeCompare(b.event) || a.source.localeCompare(b.source))
}
const rows = computed(() => eventRows(selectedRoom.value))
function targetFor(source: string, event: string) {
  return routes.value.find((rule) => rule.source === source && rule.event === event)?.target ?? ''
}
async function changeTarget(select: Event, source: string, event: string) {
  const input = select.target as HTMLSelectElement
  await setRoute(source, event, input.value || null)
  input.value = targetFor(source, event)
}

const eventStatsByRoom = computed(() => Object.fromEntries(
  roomNames.value.map((room) => {
    const roomEvents = [...new Set(eventRows(room).map((row) => row.event))]

    return [room, {
      enabled: roomEvents.filter((event) => props.isEventEnabled(room, event)).length,
      notifications: roomEvents.filter((event) => props.isNotificationEnabled(room, event)).length,
      total: roomEvents.length,
    }]
  }),
))

watch(roomNames, (rooms) => {
  if (requestedRoom && rooms.includes(requestedRoom)) {
    selectedRoom.value = requestedRoom
    requestedRoom = ''
    return
  }
  if (!rooms.includes(selectedRoom.value)) selectedRoom.value = rooms[0] ?? ''
}, { immediate: true })

const selectedLocation = computed(() => {
  for (const contour of props.contours) {
    for (const server of contour.servers) {
      if (server.rooms.includes(selectedRoom.value)) {
        return { contourId: contour.id, serverId: server.id, screenId: server.activeScreenId }
      }
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

const events = computed(() => [...new Set(rows.value.map((row) => row.event))])

function selectTreeRoom(_serverId: string, _screenId: string, room: string) {
  selectedRoom.value = room
}

function allEventsEnabled() {
  return events.value.every((event) => props.isEventEnabled(selectedRoom.value, event))
}

function toggleAllEvents() {
  const enabled = !allEventsEnabled()
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
      :rooms="listedRooms"
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

        <div v-if="selectedRoom" class="flex items-center gap-2">
          <button
            v-if="events.length"
            type="button"
            class="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="toggleAllEvents"
          >
            {{ allEventsEnabled() ? 'Скрыть всю ленту' : 'Показать всю ленту' }}
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="toggleRoomNotifications(selectedRoom)"
          >
            {{ isRoomNotificationEnabled(selectedRoom) ? 'Отключить Push комнаты' : 'Включить Push комнаты' }}
          </button>
        </div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto p-5">
        <section class="mx-auto max-w-6xl">
          <p v-if="!selectedRoom" class="py-12 text-center text-sm text-muted-foreground">
            Пока нет комнат
          </p>
          <p v-else-if="events.length === 0" class="py-12 text-center text-sm text-muted-foreground">
            В этой комнате пока нет событий
          </p>

          <div v-else class="overflow-x-auto rounded-lg border">
            <div class="grid min-w-[760px] grid-cols-[minmax(10rem,1fr)_10rem_16rem_5rem_5rem] gap-2 items-center border-b bg-muted/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Событие</span>
              <span>Исходная комната</span>
              <span>Целевая комната</span>
              <span class="text-center">Лента</span>
              <span class="text-center">Push</span>
            </div>
            <div
              v-for="row in rows"
              :key="JSON.stringify([row.source, row.event])"
              class="grid min-w-[760px] grid-cols-[minmax(10rem,1fr)_10rem_16rem_5rem_5rem] gap-2 items-center border-b px-4 py-2 last:border-b-0 hover:bg-muted/50"
            >
              <span class="truncate font-mono text-sm">{{ row.event }}</span>
              <span class="truncate text-xs text-muted-foreground" :title="row.source">{{ row.source }}</span>
              <div class="flex min-w-0 items-center gap-1">
                <select class="min-w-0 flex-1 rounded border bg-background px-2 py-1.5 text-xs"
                  :value="targetFor(row.source, row.event)" :disabled="busy || !loaded"
                  :aria-label="`Целевая комната для ${row.event} из ${row.source}`"
                  @change="changeTarget($event, row.source, row.event)">
                  <option value="">Без перенаправления</option>
                  <option v-for="room in roomNames.filter((name) => name !== row.source)" :key="room" :value="room">{{ room }}</option>
                </select>
                <button type="button" class="size-7 shrink-0 rounded hover:bg-muted disabled:opacity-30"
                  :disabled="busy || !loaded || !targetFor(row.source, row.event)" title="Сбросить перенаправление"
                  :aria-label="`Сбросить маршрут ${row.event} из ${row.source}`"
                  @click="setRoute(row.source, row.event, null)">↺</button>
              </div>
              <EventToggle
                class="justify-self-center"
                :checked="isEventEnabled(selectedRoom, row.event)"
                :label="`Показывать ${row.event} в ленте`"
                @toggle="toggleEvent(selectedRoom, row.event)"
              />
              <EventToggle
                class="justify-self-center"
                :checked="isNotificationEnabled(selectedRoom, row.event)"
                :disabled="!isRoomNotificationEnabled(selectedRoom)"
                :label="`Push для ${row.event}`"
                @toggle="toggleNotification(selectedRoom, row.event)"
              />
            </div>
          </div>

          <p v-if="error" role="alert" class="mt-3 text-sm text-destructive">{{ error }}</p>
          <p v-if="selectedRoom" class="mt-3 text-xs text-muted-foreground">
            Маршрут применяется к новым сообщениям один раз. Лента и Push относятся к выбранной комнате.
          </p>
          <p v-if="selectedRoom" class="mt-4 text-xs text-muted-foreground">
            Новые события включаются автоматически, если Push комнаты не отключён.
          </p>
        </section>
      </main>
    </section>
  </div>
</template>
