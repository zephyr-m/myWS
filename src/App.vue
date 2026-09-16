<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useEventKinds } from '@/composables/useEventKinds'
import EventTypesPage from '@/components/EventTypesPage.vue'
import { playKindSound, type KindCounts } from '@/lib/event-types'
import ChannelPanel from '@/components/ChannelPanel.vue'
import DocsPage from '@/components/DocsPage.vue'
import EventSettings from '@/components/EventSettings.vue'
import RoomList from '@/components/RoomList.vue'
import RoomTabs from '@/components/RoomTabs.vue'
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
} from '@/composables/useScreens'

const isDocsPage = window.location.pathname === '/docs'
const isTypesPage = window.location.pathname === '/event-types'
const isEventsPage = window.location.pathname === '/events'
let notificationAudio: AudioContext | null = null

const soundReady = ref(false)
const soundError = ref('')

async function enableNotificationSound() {
  try {
    if (!notificationAudio || notificationAudio.state === 'closed') {
      notificationAudio = new AudioContext()
      notificationAudio.onstatechange = () => {
        soundReady.value = notificationAudio?.state === 'running'
      }
    }
    if (notificationAudio.state !== 'running') await notificationAudio.resume()
    soundReady.value = notificationAudio.state === 'running'
    soundError.value = ''
  } catch (error) {
    soundError.value = 'Не удалось включить звук. Проверьте разрешения браузера.'
    console.warn('Failed to enable notification audio', error)
  }
}

function playNotificationSound(kind: ReturnType<typeof kindForLog>) {
  if (notificationAudio) playKindSound(notificationAudio, kind)
}

async function testNotificationSound() {
  await enableNotificationSound()
  playNotificationSound(types.value.find((kind) => kind.id === 'error') ?? types.value[0]!)
}

function activateNotifications() {
  void enableNotificationSound()
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission().catch((error) => console.warn('Notification permission request failed', error))
  }
}

function notifyAboutLog(log: LogEntry) {
  const message = parseLogMessage(log.message)
  if (isEventEnabled(log.room, message.event)) {
    try { playNotificationSound(kindForLog(log)) }
    catch (error) {
      soundError.value = 'Не удалось воспроизвести звук. Нажмите «Проверить звук».'
      console.warn('Notification sound failed', error)
    }
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    if (!isNotificationEnabled(log.room, message.event)) return
    const notification = new Notification(`# ${log.room} · ${message.event}`, {
      body: message.message,
      silent: true,
      tag: log.id,
    })
    notification.addEventListener('click', () => {
      window.focus()
      notification.close()
    })
  }
}

if (!isDocsPage && !isEventsPage && !isTypesPage) {
  window.addEventListener('click', activateNotifications, true)
  window.addEventListener('keydown', activateNotifications, true)
}
onUnmounted(() => {
  window.removeEventListener('click', activateNotifications, true)
  window.removeEventListener('keydown', activateNotifications, true)
  void notificationAudio?.close()
})

const {
  isEventEnabled,
  isNotificationEnabled,
  isRoomNotificationEnabled,
  toggleEvent,
  toggleNotification,
  toggleRoomNotifications,
} = useEventFilters()
const { connected, clearHistory, deleteRoom: deleteRoomFromPool, logsByRoom, rooms } = useLogStream(notifyAboutLog)
const { firstUnreadIndex, markReadThrough } = useReadState()
const { types, kindForLog } = useEventKinds()
const {
  toggleRoomPin,
  openRoomTab,
  closeRoomTab,
  assignRoom,
  releaseRoom,
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
const unreadByRoom = computed<Record<string, KindCounts>>(() => Object.fromEntries(
  rooms.value.map(({ name }) => {
    const logs = visibleLogsByRoom.value[name] ?? []
    const counts: KindCounts = {}
    for (const log of logs.slice(firstUnreadIndex(name, logs))) {
      const id = kindForLog(log).id
      counts[id] = (counts[id] ?? 0) + 1
    }
    return [name, counts]
  }),
))

const viewMode = ref<'rooms' | 'screens'>(localStorage.getItem('live-logs.view-mode') === 'screens' ? 'screens' : 'rooms')
watch(viewMode, (mode) => {
  localStorage.setItem('live-logs.view-mode', mode)
  previewRoom.value = null
})
const displayedRoom = computed(() => viewMode.value === 'rooms' ? activeServer.value.activeRoomTab : previewRoom.value)
function assignToServer(room: string, serverId: string) {
  assignRoom(room, serverId)
  openRoomTab(room, serverId)
  viewMode.value = 'rooms'
}
function closeDisplayedRoom() {
  if (viewMode.value === 'rooms' && displayedRoom.value) closeRoomTab(displayedRoom.value)
  else previewRoom.value = null
}

const previewRoom = ref<string | null>(null)
watch([activeContourId, activeServerId, activeScreenId], () => { previewRoom.value = null })
watch(rooms, () => {
  if (previewRoom.value && !rooms.value.some((room) => room.name === previewRoom.value)) {
    previewRoom.value = null
  }
})

function openRoom(room: string) {
  if (viewMode.value === 'rooms') openRoomTab(room)
  else previewRoom.value = room
}

function moveRoom(room: string, serverId: string, screenId: string) {
  const target = contours.value.flatMap((contour) => contour.servers)
    .find((server) => server.id === serverId)?.screens.find((screen) => screen.id === screenId)
  if (!target || target.rooms.some((entry) => entry.name === room)) return
  const full = target.rooms.filter((entry) => entry.size === 'full').length
  const top = target.rooms.filter((entry) => entry.size === 'top').length
  const bottom = target.rooms.filter((entry) => entry.size === 'bottom').length
  if (top === bottom && full + Math.max(top, bottom) >= 6) {
    window.alert('На выбранном экране нет свободного места')
    return
  }
  const size = top > bottom ? 'bottom' : bottom > top ? 'top' : 'full'
  const row = size === 'bottom' ? 'bottom' : 'top'
  const index = [1, 2, 3, 4, 5, 6].find((index) =>
    !target.rooms.some((entry) => entry.place.row === row && entry.place.index === index))
  if (!index) return
  detachRoom(room)
  assignRoom(room, serverId)
  target.rooms.push({ name: room, size, place: { row, index },
    order: Math.max(-1, ...target.rooms.map((entry) => entry.order)) + 1 })
  previewRoom.value = null
  viewMode.value = 'screens'
  selectScreen(serverId, screenId)
  activeRoom.value = room
}

function detachRoom(room: string) {
  for (const contour of contours.value) {
    for (const server of contour.servers) {
      for (const screen of server.screens) {
        screen.rooms = screen.rooms.filter((entry) => entry.name !== room)
        if (screen.activeRoom === room) screen.activeRoom = null
      }
    }
  }
}

function closeRoom(room: string) {
  openRooms.value = openRooms.value.filter((openRoom) => openRoom.name !== room)
  if (activeRoom.value === room) activeRoom.value = null
}

async function deleteRoom(room: string) {
  if (!window.confirm(`Удалить комнату «${room}», её историю и привязки к серверам и экранам?`)) return
  try {
    await deleteRoomFromPool(room)
    releaseRoom(room)
    for (const contour of contours.value) {
      for (const server of contour.servers) closeRoomTab(room, server, true)
    }
    if (previewRoom.value === room) previewRoom.value = null
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Не удалось удалить комнату')
  }
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

function markAllRead(room: string) {
  const logs = logsByRoom[room] ?? []
  const last = logs.at(-1)
  if (last) markReadThrough(room, last, logs)
}

async function clearRoomHistory(room: string) {
  if (!window.confirm(`Очистить историю комнаты «${room}» для всех клиентов? Сообщения будут удалены без возможности восстановления.`)) return
  try {
    await clearHistory(room)
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Не удалось очистить историю')
  }
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
  previewRoom.value = null
  viewMode.value = 'screens'
  selectScreen(serverId, screenId)
  activeRoom.value = room
}

function selectCurrentScreen(screenId: string) {
  previewRoom.value = null
  selectScreen(activeServer.value.id, screenId)
}
</script>

<template>
  <DocsPage v-if="isDocsPage" />
  <EventTypesPage v-else-if="isTypesPage" />

  <EventSettings
    v-else-if="isEventsPage"
    :connected="connected"
    :contours="contours"
    :rooms="rooms"
    :logs-by-room="logsByRoom"
    :is-event-enabled="isEventEnabled"
    :is-notification-enabled="isNotificationEnabled"
    :is-room-notification-enabled="isRoomNotificationEnabled"
    :toggle-event="toggleEvent"
    :toggle-notification="toggleNotification"
    :toggle-room-notifications="toggleRoomNotifications"
  />

  <div v-else class="flex h-dvh overflow-hidden bg-background text-foreground">
    <RoomList
      :active-contour-id="activeContourId"
      :active-room="viewMode === 'rooms' ? displayedRoom : previewRoom ?? activeRoom"
      :view-mode="viewMode"
      @update:view-mode="viewMode = $event"
      @select-server-room="(serverId, room) => openRoomTab(room, serverId)"
      @assign-room="assignToServer"
      @release-room="releaseRoom"
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
      @delete-room="deleteRoom"
      @delete-screen="removeScreen"
      @delete-server="removeServer"
      @rename-contour="editContour"
      @rename-screen="editScreen"
      @rename-server="editServer"
      @select="openRoom"
      @move-room="moveRoom"
      @detach-room="detachRoom"
      @select-contour="(id) => { previewRoom = null; selectContour(id) }"
      @select-screen="(serverId, screenId) => { previewRoom = null; selectScreen(serverId, screenId) }"
      @select-screen-room="selectScreenRoom"
      @select-server="(contourId, serverId) => { previewRoom = null; selectServer(contourId, serverId) }"
    />

    <Separator orientation="vertical" />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="flex items-center justify-end gap-3 border-b px-3 py-1 text-xs text-muted-foreground">
        <span v-if="soundError" role="status">{{ soundError }}</span>
        <span v-else-if="!soundReady">Звук ещё не включён браузером</span>
        <button type="button" class="rounded px-2 py-1 hover:bg-muted" @click="testNotificationSound">
          {{ soundReady ? 'Проверить звук' : 'Включить и проверить звук' }}
        </button>
      </div>
      <RoomTabs
        v-if="viewMode === 'rooms'"
        :rooms="activeServer.roomTabs"
        :pinned-rooms="activeServer.pinnedRoomTabs"
        @pin="toggleRoomPin"
        @read-all="markAllRead"
        @clear="clearRoomHistory"
        :active-room="activeServer.activeRoomTab"
        :unread-by-room="unreadByRoom"
        @select="openRoomTab($event)"
        @close="closeRoomTab($event)"
      />
      <ScreenTabs
        v-else
        :active-screen-id="previewRoom ? '' : activeScreenId"
        :screens="openScreens"
        :unread-by-room="unreadByRoom"
        @close="closeScreenTab"
        @select="selectCurrentScreen"
      />

    <ChannelPanel
      v-if="displayedRoom"
      :key="displayedRoom"
      class="min-h-0 flex-1"
      :active="true"
      :can-make-full="true"
      :resizable="false"
      :first-unread-index="firstUnreadIndex(displayedRoom, visibleLogsByRoom[displayedRoom] ?? [])"
      :half="false"
      :logs="visibleLogsByRoom[displayedRoom] ?? []"
      :room="displayedRoom"
      @close="closeDisplayedRoom"
      @read-through="readThrough(displayedRoom, $event)"
    />
    <main v-else-if="viewMode === 'screens' && openRooms.length" class="flex min-h-0 min-w-0 flex-1 gap-px bg-border">
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
