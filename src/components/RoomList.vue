<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
  eventStatsByRoom?: Record<string, { enabled: number; total: number }>
  mode?: 'dashboard' | 'events'
  rooms: RoomSummary[]
  unreadByRoom: Record<string, number>
}>(), {
  eventStatsByRoom: () => ({}),
  mode: 'dashboard',
})

defineEmits<{
  createContour: []
  createScreen: [server: LogServer]
  createServer: [contour: LogContour]
  deleteContour: [contour: LogContour]
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

const expandedContours = ref<Set<string>>(new Set())
const expandedServers = ref<Set<string>>(new Set())
const expandedScreens = ref<Set<string>>(new Set())
const roomByName = computed(() => new Map(props.rooms.map((room) => [room.name, room])))
const assignedRoomNames = computed(() => new Set(
  props.contours.flatMap((contour) => contour.servers.flatMap((server) =>
    server.screens.flatMap((screen) => screen.rooms.map((room) => room.name)),
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

function screenUnread(screen: LogScreen) {
  return screen.rooms.reduce((total, room) => total + (props.unreadByRoom[room.name] ?? 0), 0)
}

function serverUnread(server: LogServer) {
  return server.screens.reduce((total, screen) => total + screenUnread(screen), 0)
}

function contourUnread(contour: LogContour) {
  return contour.servers.reduce((total, server) => total + serverUnread(server), 0)
}

function serverOnline(server: LogServer) {
  return server.screens.some((screen) => screen.rooms.some((room) =>
    (roomByName.value.get(room.name)?.producers ?? 0) > 0,
  ))
}

function unreadLabel(count: number) {
  return count > 99 ? '99+' : count
}
</script>

<template>
  <aside class="flex w-52 shrink-0 flex-col bg-muted/25 sm:w-72">
    <header class="flex h-16 shrink-0 items-center gap-2 px-4">
      <span
        class="size-2 rounded-full"
        :class="connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
      />
      <span class="truncate text-sm font-semibold">
        {{ mode === 'events' ? 'Настройка событий' : 'Live logs' }}
      </span>
    </header>

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
            <span
              v-if="mode === 'dashboard' && contourUnread(contour)"
              class="mr-1 rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white"
            >
              {{ unreadLabel(contourUnread(contour)) }}
            </span>
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
                <span
                  v-if="mode === 'dashboard' && serverUnread(server)"
                  class="mr-1 rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white"
                >
                  {{ unreadLabel(serverUnread(server)) }}
                </span>
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
                    <span
                      v-if="mode === 'dashboard' && screenUnread(screen)"
                      class="mr-1 rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white"
                    >
                      {{ unreadLabel(screenUnread(screen)) }}
                    </span>
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
                    <button
                      v-for="room in screen.rooms"
                      :key="room.name"
                      type="button"
                      class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                      :class="activeServerId === server.id && activeScreenId === screen.id && activeRoom === room.name && 'bg-muted'"
                      @click="$emit('selectScreenRoom', server.id, screen.id, room.name)"
                    >
                      <span class="text-muted-foreground">#</span>
                      <span class="min-w-0 flex-1 truncate">{{ room.name }}</span>
                      <span
                        v-if="mode === 'events'"
                        class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground"
                      >
                        {{ eventStatsByRoom[room.name]?.enabled ?? 0 }}/{{ eventStatsByRoom[room.name]?.total ?? 0 }}
                      </span>
                      <span
                        v-if="mode === 'dashboard' && unreadByRoom[room.name]"
                        class="rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white"
                      >
                        {{ unreadLabel(unreadByRoom[room.name]) }}
                      </span>
                      <span
                        v-if="(roomByName.get(room.name)?.producers ?? 0) > 0"
                        class="size-1.5 shrink-0 rounded-full bg-emerald-500"
                      />
                    </button>
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
        Все комнаты распределены по экранам.
      </p>

      <Button
        v-for="room in availableRooms"
        :key="room.name"
        variant="ghost"
        class="mb-1 h-auto w-full justify-start gap-2 px-2.5 py-2"
        :disabled="mode === 'dashboard' && !canOpenRoom"
        @click="$emit('select', room.name)"
      >
        <span class="text-muted-foreground">#</span>
        <span class="min-w-0 flex-1 truncate text-left">{{ room.name }}</span>
        <span
          v-if="mode === 'events'"
          class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground"
        >
          {{ eventStatsByRoom[room.name]?.enabled ?? 0 }}/{{ eventStatsByRoom[room.name]?.total ?? 0 }}
        </span>
        <span
          v-if="mode === 'dashboard' && unreadByRoom[room.name]"
          class="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
        >
          {{ unreadLabel(unreadByRoom[room.name]) }}
        </span>
        <span
          v-if="room.producers > 0"
          class="size-1.5 shrink-0 rounded-full bg-emerald-500"
          :title="`${room.producers} подключено`"
        />
      </Button>
    </ScrollArea>

    <footer class="m-2 grid gap-1">
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
  </aside>
</template>
