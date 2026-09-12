<script setup lang="ts">
import { computed } from 'vue'
import ChannelPanel from '@/components/ChannelPanel.vue'
import EventSettings from '@/components/EventSettings.vue'
import RoomList from '@/components/RoomList.vue'
import ScreenTabs from '@/components/ScreenTabs.vue'
import { Separator } from '@/components/ui/separator'
import { useEventFilters } from '@/composables/useEventFilters'
import { useLogStream } from '@/composables/useLogStream'
import { useReadState } from '@/composables/useReadState'
import { useScreens } from '@/composables/useScreens'
import { parseLogMessage } from '@/lib/log-events'
import type { LogEntry } from '@/types'
import type {
  LogContour,
  LogScreen,
  LogServer,
  OpenRoom,
  RoomPlace,
  RoomRow,
  RoomSize,
} from '@/composables/useScreens'

const { connected, logsByRoom, rooms } = useLogStream()
const { isEventEnabled, toggleEvent } = useEventFilters()
const { firstUnreadIndex, markReadThrough } = useReadState()
const {
  activeContourId,
  activeRoom,
  activeScreenId,
  activeServer,
  activeServerId,
  addContour,
  addScreen,
  addServer,
  closeScreenTab,
  contours,
  deleteContour,
  deleteScreen,
  deleteServer,
  openScreens,
  openRooms,
  renameContour,
  renameScreen,
  renameServer,
  selectContour,
  selectScreen,
  selectServer,
} = useScreens()
const isEventsPage = window.location.pathname === '/events'

const fullRooms = computed(() => openRooms.value.filter((room) => room.size === 'full'))
const topRooms = computed(() => openRooms.value
  .filter((room) => room.size === 'top')
  .sort((first, second) => first.place.index - second.place.index))
const bottomRooms = computed(() => openRooms.value
  .filter((room) => room.size === 'bottom')
  .sort((first, second) => first.place.index - second.place.index))
const halfRows = computed(() => [topRooms.value, bottomRooms.value])
const splitOrder = computed(() => Math.min(
  ...[...topRooms.value, ...bottomRooms.value].map((room) => room.order),
))
const splitWeight = computed(() => Math.max(topRooms.value.length, bottomRooms.value.length))
const columnCount = computed(() => fullRooms.value.length + splitWeight.value)
const canOpenRoom = computed(() =>
  topRooms.value.length !== bottomRooms.value.length || columnCount.value < 6,
)
const visibleLogsByRoom = computed(() => Object.fromEntries(
  Object.entries(logsByRoom).map(([room, logs]) => [
    room,
    logs.filter((log) => isEventEnabled(room, parseLogMessage(log.message).event)),
  ]),
))
const unreadByRoom = computed(() => Object.fromEntries(
  rooms.value.map(({ name }) => {
    const logs = visibleLogsByRoom.value[name] ?? []
    return [name, logs.length - firstUnreadIndex(name, logs)]
  }),
))

function nextPlace(preferredRow: RoomRow): RoomPlace {
  for (const row of [preferredRow, preferredRow === 'top' ? 'bottom' : 'top'] as RoomRow[]) {
    const index = [1, 2, 3, 4, 5, 6].find((candidate) =>
      !openRooms.value.some((room) => room.place.row === row && room.place.index === candidate),
    )
    if (index) return { row, index }
  }
  throw new Error('No room place available')
}

function openRoom(room: string) {
  const opened = openRooms.value.find((candidate) => candidate.name === room)
  if (opened) {
    activeRoom.value = room
    return
  }
  if (!canOpenRoom.value) return

  const size: RoomSize = topRooms.value.length > bottomRooms.value.length
    ? 'bottom'
    : bottomRooms.value.length > topRooms.value.length
      ? 'top'
      : 'full'
  const place = nextPlace(size === 'bottom' ? 'bottom' : 'top')
  const order = Math.max(-1, ...openRooms.value.map((openRoom) => openRoom.order)) + 1
  openRooms.value.push({
    name: room,
    size: size === 'full' ? 'full' : place.row,
    order,
    place,
  })
  activeRoom.value = room
}

function closeRoom(room: string) {
  openRooms.value = openRooms.value.filter((openRoom) => openRoom.name !== room)
  if (activeRoom.value === room) activeRoom.value = null
}

function canMakeFull(room: OpenRoom) {
  if (room.size === 'full') return true
  const topCount = topRooms.value.length - Number(room.size === 'top')
  const bottomCount = bottomRooms.value.length - Number(room.size === 'bottom')
  return fullRooms.value.length + 1 + Math.max(topCount, bottomCount) <= 6
}

function toggleRoomSize(room: OpenRoom) {
  if (room.size === 'full') room.size = room.place.row
  else if (canMakeFull(room)) room.size = 'full'
}

function readThrough(room: string, log: LogEntry) {
  markReadThrough(room, log, visibleLogsByRoom.value[room] ?? [])
}

function createContour() {
  const name = window.prompt('Название контура', `Контур ${contours.value.length + 1}`)?.trim()
  if (name) addContour(name)
}

function editContour(contour: LogContour) {
  const name = window.prompt('Название контура', contour.name)?.trim()
  if (name) renameContour(contour.id, name)
}

function removeContour(contour: LogContour) {
  if (window.confirm(`Удалить контур «${contour.name}» и все его серверы?`)) {
    deleteContour(contour.id)
  }
}

function createServer(contour: LogContour) {
  const name = window.prompt('Название сервера', `Сервер ${contour.servers.length + 1}`)?.trim()
  if (name) addServer(contour.id, name)
}

function editServer(server: LogServer) {
  const name = window.prompt('Название сервера', server.name)?.trim()
  if (name) renameServer(server.id, name)
}

function removeServer(server: LogServer) {
  if (window.confirm(`Удалить сервер «${server.name}» и все его экраны?`)) {
    deleteServer(server.id)
  }
}

function createScreen(server: LogServer) {
  const name = window.prompt('Название экрана', `Экран ${server.screens.length}`)?.trim()
  if (name) addScreen(server.id, name)
}

function editScreen(server: LogServer, screen: LogScreen) {
  const name = window.prompt('Название экрана', screen.name)?.trim()
  if (name) renameScreen(server.id, screen.id, name)
}

function removeScreen(server: LogServer, screen: LogScreen) {
  if (window.confirm(`Удалить экран «${screen.name}»?`)) deleteScreen(server.id, screen.id)
}

function selectScreenRoom(serverId: string, screenId: string, room: string) {
  selectScreen(serverId, screenId)
  activeRoom.value = room
}

function selectCurrentScreen(screenId: string) {
  selectScreen(activeServer.value.id, screenId)
}
</script>

<template>
  <EventSettings
    v-if="isEventsPage"
    :connected="connected"
    :contours="contours"
    :rooms="rooms"
    :logs-by-room="logsByRoom"
    :is-event-enabled="isEventEnabled"
    :toggle-event="toggleEvent"
  />

  <div v-else class="flex h-dvh overflow-hidden bg-background text-foreground">
    <RoomList
      :active-contour-id="activeContourId"
      :active-room="activeRoom"
      :active-screen-id="activeScreenId"
      :active-server-id="activeServerId"
      :can-open-room="canOpenRoom"
      :connected="connected"
      :contours="contours"
      :rooms="rooms"
      :unread-by-room="unreadByRoom"
      @create-contour="createContour"
      @create-screen="createScreen"
      @create-server="createServer"
      @delete-contour="removeContour"
      @delete-screen="removeScreen"
      @delete-server="removeServer"
      @rename-contour="editContour"
      @rename-screen="editScreen"
      @rename-server="editServer"
      @select="openRoom"
      @select-contour="selectContour"
      @select-screen="selectScreen"
      @select-screen-room="selectScreenRoom"
      @select-server="selectServer"
    />

    <Separator orientation="vertical" />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <ScreenTabs
        :active-screen-id="activeScreenId"
        :screens="openScreens"
        @close="closeScreenTab"
        @select="selectCurrentScreen"
      />

    <main v-if="openRooms.length" class="flex min-h-0 min-w-0 flex-1 gap-px bg-border">
      <ChannelPanel
        v-for="room in fullRooms"
        :key="`${activeServerId}:${activeScreenId}:${room.name}`"
        class="min-w-0 bg-background"
        :style="{ order: room.order, flex: '1 1 0' }"
        :active="activeRoom === room.name"
        :can-make-full="true"
        :first-unread-index="firstUnreadIndex(room.name, visibleLogsByRoom[room.name] ?? [])"
        :half="false"
        :logs="visibleLogsByRoom[room.name] ?? []"
        :room="room.name"
        @activate="activeRoom = room.name"
        @close="closeRoom(room.name)"
        @read-through="readThrough(room.name, $event)"
        @toggle-size="toggleRoomSize(room)"
      />

      <div
        v-if="splitWeight"
        class="flex min-w-0 flex-col gap-px bg-border"
        :style="{ order: splitOrder, flexGrow: splitWeight, flexBasis: 0 }"
      >
        <div
          v-for="(row, rowIndex) in halfRows"
          :key="rowIndex"
          class="flex min-h-0 flex-1 gap-px bg-border"
        >
          <ChannelPanel
            v-for="room in row"
            :key="`${activeServerId}:${activeScreenId}:${room.name}`"
            class="min-w-0 flex-1 bg-background"
            :active="activeRoom === room.name"
            :can-make-full="canMakeFull(room)"
            :first-unread-index="firstUnreadIndex(room.name, visibleLogsByRoom[room.name] ?? [])"
            :half="true"
            :logs="visibleLogsByRoom[room.name] ?? []"
            :room="room.name"
            @activate="activeRoom = room.name"
            @close="closeRoom(room.name)"
            @read-through="readThrough(room.name, $event)"
            @toggle-size="toggleRoomSize(room)"
          />
          <div
            v-if="row.length === 0"
            class="grid min-w-0 flex-1 place-items-center bg-muted/10 p-4 text-center"
          >
            <p class="text-xs text-muted-foreground">Следующая комната откроется здесь</p>
          </div>
        </div>
      </div>
    </main>

    <main v-else class="grid min-w-0 flex-1 place-items-center bg-muted/10 p-4 text-center">
      <p class="text-xs text-muted-foreground">Выберите комнату</p>
    </main>
    </div>
  </div>
</template>
