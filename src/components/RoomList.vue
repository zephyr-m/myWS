<script setup lang="ts">
import { sumKindCounts, type KindCounts } from '@/lib/event-types'
import UnreadBadges from '@/components/UnreadBadges.vue'
import { computed, ref, watch } from 'vue'
import { Bug, Settings, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { LogContour, LogScreen, LogServer } from '@/composables/useScreens'
import type { RoomSummary } from '@/types'

const props = withDefaults(defineProps<{
  activeContourId: string
  activeRoom: string | null
  activeScreenId: string
  activeServerId: string
  canOpenRoom: boolean
  connected: boolean
  contours: LogContour[]
  eventStatsByRoom?: Record<string, { enabled: number; notifications: number; total: number }>
  viewMode?: 'rooms' | 'screens'
  mode?: 'dashboard' | 'events'
  rooms: RoomSummary[]
  unreadByRoom: Record<string, KindCounts>
}>(), {
  eventStatsByRoom: () => ({}),
  mode: 'dashboard',
  viewMode: 'screens',
})

const totalUnread = computed(() => sumKindCounts(Object.keys(props.unreadByRoom), props.unreadByRoom))

defineEmits<{
  'update:viewMode': [mode: 'rooms' | 'screens']
  selectServerRoom: [serverId: string, room: string]
  assignRoom: [room: string, serverId: string]
  releaseRoom: [room: string]
  moveRoom: [room: string, serverId: string, screenId: string]
  detachRoom: [room: string]
  createContour: []
  createScreen: [server: LogServer]
  createServer: [contour: LogContour]
  deleteContour: [contour: LogContour]
  deleteRoom: [room: string]
  deleteScreen: [server: LogServer, screen: LogScreen]
  deleteServer: [server: LogServer]
  renameContour: [contour: LogContour]
  renameScreen: [server: LogServer, screen: LogScreen]
  renameServer: [server: LogServer]
  select: [room: string]
  selectContour: [contourId: string]
  selectScreen: [serverId: string, screenId: string]
  selectScreenRoom: [serverId: string, screenId: string, room: string]
  selectServer: [contourId: string, serverId: string]
}>()

const roomDialog = ref<HTMLDialogElement | null>(null)
const actionRoom = ref('')
const targetScreen = ref('')
const targetServer = ref('')
const serverOptions = computed(() => props.contours.flatMap((contour) => contour.servers.map((server) => ({
  id: server.id, label: `${contour.name} / ${server.name}`, current: server.rooms.includes(actionRoom.value),
}))))
const screenOptions = computed(() => props.contours.flatMap((contour) =>
  contour.servers.flatMap((server) => server.screens.map((screen) => ({
    key: JSON.stringify([server.id, screen.id]),
    serverId: server.id,
    screenId: screen.id,
    label: `${contour.name} / ${server.name} / ${screen.name}`,
    current: screen.rooms.some((room) => room.name === actionRoom.value),
  }))),
))
const selectedTarget = computed(() => screenOptions.value.find((screen) => screen.key === targetScreen.value))

function showRoomActions(event: MouseEvent, room: string) {
  if (props.mode !== 'dashboard') return
  event.preventDefault()
  actionRoom.value = room
  targetScreen.value = ''
  targetServer.value = ''
  roomDialog.value?.showModal()
}

const expandedContours = ref<Set<string>>(new Set())
const expandedServers = ref<Set<string>>(new Set())
const expandedScreens = ref<Set<string>>(new Set())
const sidebarWidth = ref(Math.min(640, Math.max(
  208,
  Number(localStorage.getItem('live-logs.sidebar-width')) || (window.innerWidth >= 640 ? 288 : 208),
)))
const roomByName = computed(() => new Map(props.rooms.map((room) => [room.name, room])))
const assignedRoomNames = computed(() => new Set(
  props.contours.flatMap((contour) => contour.servers.flatMap((server) =>
    server.rooms,
  )),
))
const availableRooms = computed(() =>
  props.rooms.filter((room) => !assignedRoomNames.value.has(room.name)),
)

watch(
  () => [props.activeContourId, props.activeServerId, props.activeScreenId] as const,
  ([contourId, serverId, screenId]) => {
    expandedContours.value = new Set([...expandedContours.value, contourId])
    expandedServers.value = new Set([...expandedServers.value, serverId])
    expandedScreens.value = new Set([...expandedScreens.value, screenKey(serverId, screenId)])
  },
  { immediate: true },
)

function screenKey(serverId: string, screenId: string) {
  return `${serverId}:${screenId}`
}

function toggleItem(items: Set<string>, id: string) {
  const expanded = new Set(items)
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
  return expanded
}

function toggleContour(id: string) {
  expandedContours.value = toggleItem(expandedContours.value, id)
}

function toggleServer(id: string) {
  expandedServers.value = toggleItem(expandedServers.value, id)
}

function toggleScreen(serverId: string, screenId: string) {
  expandedScreens.value = toggleItem(expandedScreens.value, screenKey(serverId, screenId))
}

function unplacedRooms(server: LogServer) {
  const placed = new Set(server.screens.flatMap((screen) => screen.rooms.map((room) => room.name)))
  return server.rooms.filter((room) => !placed.has(room))
}

function screenUnread(screen: LogScreen) {
  return sumKindCounts(screen.rooms.map((room) => room.name), props.unreadByRoom)
}
function serverUnread(server: LogServer) { return sumKindCounts(server.rooms, props.unreadByRoom) }
function contourUnread(contour: LogContour) {
  return sumKindCounts(contour.servers.flatMap((server) => server.rooms), props.unreadByRoom)
}

function serverOnline(server: LogServer) {
  return server.rooms.some((room) => (roomByName.value.get(room)?.producers ?? 0) > 0)
}


function eventSettingsUrl(room: string) {
  return `/events?room=${encodeURIComponent(room)}`
}

function startResize(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  const startX = event.clientX
  const startWidth = sidebarWidth.value

  handle.setPointerCapture(event.pointerId)
  handle.onpointermove = (moveEvent) => {
    sidebarWidth.value = Math.min(640, Math.max(208, startWidth + moveEvent.clientX - startX))
  }
  handle.onpointerup = () => {
    handle.onpointermove = null
    handle.onpointerup = null
    localStorage.setItem('live-logs.sidebar-width', String(sidebarWidth.value))
  }
}
</script>

<template>
  <aside
    class="relative flex shrink-0 flex-col bg-muted/25"
    :style="{ width: `${sidebarWidth}px` }"
  >
    <div
      class="group absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none"
      title="Изменить ширину меню"
      @pointerdown="startResize"
    >
      <span class="mx-auto block h-full w-px bg-transparent group-hover:bg-sky-500/60" />
    </div>
    <header class="flex min-h-16 shrink-0 items-center gap-2 px-4 py-3">
      <Bug class="size-4 shrink-0 text-sky-500" />
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span class="text-sm font-semibold">
          {{ mode === 'events' ? 'Настройка событий' : 'Live Debug' }}
        </span>
        <UnreadBadges v-if="mode === 'dashboard'" class="min-w-0 max-w-full" :counts="totalUnread" />
      </div>
      <span
        class="size-2 shrink-0 rounded-full"
        :class="connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
      />
    </header>

    <div v-if="mode === 'dashboard'" class="mx-2 mb-2 flex rounded border p-1" aria-label="Режим просмотра">
      <button v-for="item in (['rooms', 'screens'] as const)" :key="item" type="button"
        class="flex-1 rounded px-3 py-1.5 text-xs" :class="viewMode === item ? 'bg-muted font-semibold' : 'text-muted-foreground'"
        :aria-pressed="viewMode === item" @click="$emit('update:viewMode', item)">
        {{ item === 'rooms' ? 'Комнаты' : 'Экраны' }}
      </button>
    </div>
    <ScrollArea class="min-h-0 flex-1 px-2 pb-3">
      <div class="mb-5">
        <div class="mb-1 flex items-center justify-between px-2">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Контуры
          </p>
          <button
            v-if="mode === 'dashboard'"
            type="button"
            class="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Новый контур"
            @click="$emit('createContour')"
          >
            +
          </button>
        </div>

        <div v-for="contour in contours" :key="contour.id" class="mb-0.5">
          <div
            class="group/contour flex items-center rounded-md"
            :class="activeContourId === contour.id && 'bg-muted/70'"
          >
            <button
              type="button"
              class="grid size-7 shrink-0 place-items-center text-xs text-muted-foreground"
              :aria-label="expandedContours.has(contour.id) ? 'Свернуть контур' : 'Развернуть контур'"
              @click="toggleContour(contour.id)"
            >
              {{ expandedContours.has(contour.id) ? '▾' : '▸' }}
            </button>
            <button
              type="button"
              class="min-w-0 flex-1 truncate py-2 text-left text-xs font-semibold uppercase tracking-wide"
              @click="$emit('selectContour', contour.id)"
            >
              {{ contour.name }}
            </button>
            <UnreadBadges v-if="mode === 'dashboard'" :counts="contourUnread(contour)" />
            <button
              v-if="mode === 'dashboard'"
              type="button"
              class="hidden size-6 shrink-0 place-items-center text-xs text-muted-foreground hover:text-foreground group-hover/contour:grid"
              title="Переименовать контур"
              @click="$emit('renameContour', contour)"
            >
              ✎
            </button>
            <button
              v-if="mode === 'dashboard' && contours.length > 1"
              type="button"
              class="mr-1 hidden size-6 shrink-0 place-items-center text-sm text-muted-foreground hover:text-destructive group-hover/contour:grid"
              title="Удалить контур"
              @click="$emit('deleteContour', contour)"
            >
              ×
            </button>
          </div>

          <div v-if="expandedContours.has(contour.id)" class="ml-3 border-l pl-1">
            <div v-for="server in contour.servers" :key="server.id" class="mb-0.5">
              <div
                class="group/server flex items-center rounded-md"
                :class="activeContourId === contour.id && activeServerId === server.id && 'bg-muted'"
              >
                <button
                  type="button"
                  class="grid size-7 shrink-0 place-items-center text-xs text-muted-foreground"
                  :aria-label="expandedServers.has(server.id) ? 'Свернуть сервер' : 'Развернуть сервер'"
                  @click="toggleServer(server.id)"
                >
                  {{ expandedServers.has(server.id) ? '▾' : '▸' }}
                </button>
                <button
                  type="button"
                  class="min-w-0 flex-1 truncate py-1.5 text-left text-sm"
                  @click="$emit('selectServer', contour.id, server.id)"
                >
                  {{ server.name }}
                </button>
                <span
                  v-if="serverOnline(server)"
                  class="mr-1 size-1.5 shrink-0 rounded-full bg-emerald-500"
                  title="Есть подключенные комнаты"
                />
                <UnreadBadges v-if="mode === 'dashboard'" :counts="serverUnread(server)" />
                <button
                  v-if="mode === 'dashboard'"
                  type="button"
                  class="hidden size-6 shrink-0 place-items-center text-xs text-muted-foreground hover:text-foreground group-hover/server:grid"
                  title="Переименовать сервер"
                  @click="$emit('renameServer', server)"
                >
                  ✎
                </button>
                <button
                  v-if="mode === 'dashboard' && contour.servers.length > 1"
                  type="button"
                  class="mr-1 hidden size-6 shrink-0 place-items-center text-sm text-muted-foreground hover:text-destructive group-hover/server:grid"
                  title="Удалить сервер"
                  @click="$emit('deleteServer', server)"
                >
                  ×
                </button>
              </div>

              <div v-if="expandedServers.has(server.id)" class="ml-3 border-l pl-1">
                <div v-if="viewMode === 'rooms' || mode === 'events' || unplacedRooms(server).length" class="py-1">
                  <p v-if="viewMode === 'screens' && mode === 'dashboard'" class="p-2 text-[10px] text-muted-foreground">Без экрана</p>
                  <p v-if="!server.rooms.length" class="p-2 text-xs text-muted-foreground">Нет комнат</p>
                  <div v-for="room in (viewMode === 'screens' && mode === 'dashboard' ? unplacedRooms(server) : server.rooms)" :key="room" class="flex items-center rounded hover:bg-muted"
                    :class="activeServerId === server.id && activeRoom === room && 'bg-muted'"
                    @contextmenu="showRoomActions($event, room)">
                    <button type="button" class="flex min-w-0 flex-1 items-center gap-2 p-2 text-left text-xs"
                      @click="mode === 'events' || viewMode === 'screens' ? $emit('select', room) : $emit('selectServerRoom', server.id, room)">
                      <span class="truncate"># {{ room }}</span>
                      <span v-if="mode === 'events'" class="shrink-0 text-[9px] text-muted-foreground">
                        {{ eventStatsByRoom[room]?.enabled ?? 0 }}/{{ eventStatsByRoom[room]?.total ?? 0 }}
                        · 🔔 {{ eventStatsByRoom[room]?.notifications ?? 0 }}/{{ eventStatsByRoom[room]?.total ?? 0 }}
                      </span>
                      <UnreadBadges v-if="mode === 'dashboard'" :counts="unreadByRoom[room]" />
                      <span v-if="(roomByName.get(room)?.producers ?? 0) > 0" class="size-1.5 rounded-full bg-emerald-500" />
                    </button>
                    <a v-if="mode === 'dashboard'" :href="eventSettingsUrl(room)" class="grid size-7 place-items-center"
                      :aria-label="`Настроить события комнаты ${room}`"><Settings class="size-3.5" /></a>
                    <button v-if="mode === 'dashboard'" type="button" class="size-7" :aria-label="`Действия с комнатой ${room}`"
                      @click="showRoomActions($event, room)">⋯</button>
                  </div>
                </div>
                <template v-if="viewMode === 'screens' && mode === 'dashboard'">
                <div v-for="screen in server.screens" :key="screen.id" class="mb-0.5">
                  <div
                    class="group/screen flex items-center rounded-md"
                    :class="activeServerId === server.id && activeScreenId === screen.id && 'bg-muted'"
                  >
                    <button
                      type="button"
                      class="grid size-7 shrink-0 place-items-center text-xs text-muted-foreground"
                      :aria-label="expandedScreens.has(screenKey(server.id, screen.id)) ? 'Свернуть экран' : 'Развернуть экран'"
                      @click="toggleScreen(server.id, screen.id)"
                    >
                      {{ expandedScreens.has(screenKey(server.id, screen.id)) ? '▾' : '▸' }}
                    </button>
                    <button
                      type="button"
                      class="min-w-0 flex-1 truncate py-1.5 text-left text-xs"
                      @click="$emit('selectScreen', server.id, screen.id)"
                    >
                      {{ screen.name }}
                    </button>
                    <UnreadBadges v-if="mode === 'dashboard'" :counts="screenUnread(screen)" />
                    <button
                      v-if="mode === 'dashboard' && screen.id !== 'main'"
                      type="button"
                      class="hidden size-6 shrink-0 place-items-center text-xs text-muted-foreground hover:text-foreground group-hover/screen:grid"
                      title="Переименовать экран"
                      @click="$emit('renameScreen', server, screen)"
                    >
                      ✎
                    </button>
                    <button
                      v-if="mode === 'dashboard' && screen.id !== 'main'"
                      type="button"
                      class="mr-1 hidden size-6 shrink-0 place-items-center text-sm text-muted-foreground hover:text-destructive group-hover/screen:grid"
                      title="Удалить экран"
                      @click="$emit('deleteScreen', server, screen)"
                    >
                      ×
                    </button>
                  </div>

                  <div
                    v-if="expandedScreens.has(screenKey(server.id, screen.id))"
                    class="ml-5 border-l pl-1"
                  >
                    <p
                      v-if="screen.rooms.length === 0"
                      class="px-2 py-1.5 text-[11px] text-muted-foreground"
                    >
                      Нет комнат
                    </p>
                    <div
                      v-for="room in screen.rooms"
                      :key="room.name"
                      class="group/room flex w-full items-center rounded hover:bg-muted"
                      @contextmenu="showRoomActions($event, room.name)"
                      :class="activeServerId === server.id && activeScreenId === screen.id && activeRoom === room.name && 'bg-muted'"
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs"
                        @click="$emit('selectScreenRoom', server.id, screen.id, room.name)"
                      >
                        <span class="text-muted-foreground">#</span>
                        <span class="min-w-0 flex-1 truncate">{{ room.name }}</span>
                        <UnreadBadges v-if="mode === 'dashboard'" :counts="unreadByRoom[room.name]" />
                        <span
                          v-if="(roomByName.get(room.name)?.producers ?? 0) > 0"
                          class="size-1.5 shrink-0 rounded-full bg-emerald-500"
                        />
                      </button>
                      <button
                        v-if="mode === 'dashboard'"
                        type="button"
                        class="grid size-7 shrink-0 place-items-center rounded hover:bg-background"
                        :aria-label="`Действия с комнатой ${room.name}`"
                        @click="showRoomActions($event, room.name)"
                      >⋯</button>
                      <a
                        v-if="mode === 'dashboard'"
                        :href="eventSettingsUrl(room.name)"
                        class="mr-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-60 hover:bg-background hover:text-foreground hover:opacity-100"
                        :title="`Настроить события комнаты ${room.name}`"
                      >
                        <Settings class="size-3.5" />
                      </a>
                    </div>
                  </div>
                </div>

                <button
                  v-if="mode === 'dashboard'"
                  type="button"
                  class="ml-2 flex items-center gap-1 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  @click="$emit('createScreen', server)"
                >
                  <span>+</span> Новый экран
                </button>
                </template>
              </div>
            </div>

            <button
              v-if="mode === 'dashboard'"
              type="button"
              class="ml-2 flex items-center gap-1 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              @click="$emit('createServer', contour)"
            >
              <span>+</span> Новый сервер
            </button>
          </div>
        </div>
      </div>

      <p class="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Свободные комнаты
      </p>
      <p
        v-if="rooms.length === 0"
        class="px-2 py-6 text-xs leading-5 text-muted-foreground"
      >
        Комнаты появятся после первого подключения.
      </p>
      <p
        v-else-if="availableRooms.length === 0"
        class="px-2 py-6 text-xs leading-5 text-muted-foreground"
      >
        Все комнаты назначены серверам.
      </p>

      <div
        v-for="room in availableRooms"
        :key="room.name"
        class="group/room mb-1 flex w-full items-center rounded-md hover:bg-accent hover:text-accent-foreground"
        :class="activeRoom === room.name && 'bg-accent'"
        @contextmenu="showRoomActions($event, room.name)"
      >
        <Button
          variant="ghost"
          class="h-auto min-w-0 flex-1 justify-start gap-2 px-2.5 py-2 hover:bg-transparent"
          @click="$emit('select', room.name)"
        >
          <span class="text-muted-foreground">#</span>
          <span class="min-w-0 flex-1 truncate text-left">{{ room.name }}</span>
          <span
            v-if="mode === 'events'"
            class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground"
          >
            {{ eventStatsByRoom[room.name]?.enabled ?? 0 }}/{{ eventStatsByRoom[room.name]?.total ?? 0 }}
            · 🔔 {{ eventStatsByRoom[room.name]?.notifications ?? 0 }}/{{ eventStatsByRoom[room.name]?.total ?? 0 }}
          </span>
          <UnreadBadges v-if="mode === 'dashboard'" :counts="unreadByRoom[room.name]" />
          <span
            v-if="room.producers > 0"
            class="size-1.5 shrink-0 rounded-full bg-emerald-500"
            :title="`${room.producers} подключено`"
          />
        </Button>
        <button
          v-if="mode === 'dashboard'"
          type="button"
          class="grid size-7 shrink-0 place-items-center rounded hover:bg-background"
          :aria-label="`Действия с комнатой ${room.name}`"
          @click="showRoomActions($event, room.name)"
        >⋯</button>
        <a
          v-if="mode === 'dashboard'"
          :href="eventSettingsUrl(room.name)"
          class="mr-1 grid size-7 shrink-0 place-items-center rounded text-muted-foreground opacity-60 hover:bg-background hover:text-foreground hover:opacity-100"
          :title="`Настроить события комнаты ${room.name}`"
        >
          <Settings class="size-3.5" />
        </a>
        <button
          v-if="mode === 'dashboard'"
          type="button"
          class="mr-1 grid size-7 shrink-0 place-items-center rounded text-muted-foreground opacity-60 hover:bg-background hover:text-destructive hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
          :disabled="room.producers > 0"
          :title="room.producers > 0 ? 'Сначала отключите отправителя' : `Удалить комнату ${room.name}`"
          @click="$emit('deleteRoom', room.name)"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </ScrollArea>

    <footer class="m-2 grid gap-1">
      <a href="/event-types" class="rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted">Типы событий</a>
      <a
        :href="mode === 'events' ? '/' : '/events'"
        class="rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {{ mode === 'events' ? '← Панель' : 'Настройка событий' }}
      </a>
      <a
        href="/docs"
        class="rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Документация
      </a>
    </footer>
    <dialog
      ref="roomDialog"
      class="m-auto w-full max-w-md rounded-lg border bg-background p-5 text-foreground shadow-lg backdrop:bg-black/40"
      aria-labelledby="room-actions-title"
      @click="($event.target === roomDialog) && roomDialog?.close()"
    >
      <form @submit.prevent="selectedTarget && ($emit('moveRoom', actionRoom, selectedTarget.serverId, selectedTarget.screenId), roomDialog?.close())">
        <h2 id="room-actions-title" class="mb-4 font-semibold"># {{ actionRoom }}</h2>
        <label for="room-server" class="mb-2 block text-sm">Назначить серверу</label>
        <div class="mb-4 flex gap-2">
          <select id="room-server" v-model="targetServer" class="min-w-0 flex-1 rounded border bg-background p-2 text-sm">
            <option disabled value="">Выберите сервер</option>
            <option v-for="server in serverOptions" :key="server.id" :value="server.id" :disabled="server.current">
              {{ server.label }}{{ server.current ? ' (текущий)' : '' }}
            </option>
          </select>
          <Button type="button" :disabled="!targetServer" @click="$emit('assignRoom', actionRoom, targetServer); roomDialog?.close()">Назначить</Button>
        </div>
        <p class="mb-4 text-xs text-muted-foreground">При смене сервера комната будет убрана с экранов прежнего сервера.</p>
        <label for="room-target" class="mb-2 block text-sm">
          {{ assignedRoomNames.has(actionRoom) ? 'Перенести на экран' : 'Добавить на экран' }}
        </label>
        <select id="room-target" v-model="targetScreen" class="mb-4 w-full rounded border bg-background p-2 text-sm" required>
          <option disabled value="">Выберите контур / сервер / экран</option>
          <option v-for="screen in screenOptions" :key="screen.key" :value="screen.key" :disabled="screen.current">
            {{ screen.label }}{{ screen.current ? ' (текущий)' : '' }}
          </option>
        </select>
        <div class="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" class="text-destructive"
            :disabled="(roomByName.get(actionRoom)?.producers ?? 0) > 0"
            :title="(roomByName.get(actionRoom)?.producers ?? 0) > 0 ? 'Сначала отключите отправителя' : 'Удалить комнату и историю'"
            @click="roomDialog?.close(); $emit('deleteRoom', actionRoom)">Удалить комнату</Button>
          <Button v-if="assignedRoomNames.has(actionRoom)" type="button" variant="outline"
            @click="$emit('releaseRoom', actionRoom); roomDialog?.close()">Освободить комнату</Button>
          <Button v-if="screenOptions.some((screen) => screen.current)" type="button" variant="outline"
            @click="$emit('detachRoom', actionRoom); roomDialog?.close()">Убрать с экрана</Button>
          <Button type="button" variant="ghost" @click="roomDialog?.close()">Отмена</Button>
          <Button type="submit" :disabled="!selectedTarget">
            {{ assignedRoomNames.has(actionRoom) ? 'Перенести' : 'Добавить' }}
          </Button>
        </div>
      </form>
    </dialog>
  </aside>
</template>
