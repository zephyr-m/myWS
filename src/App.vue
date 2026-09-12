<script setup lang="ts">
import { computed, ref } from 'vue'
import ChannelPanel from '@/components/ChannelPanel.vue'
import EventSettings from '@/components/EventSettings.vue'
import RoomList from '@/components/RoomList.vue'
import { Separator } from '@/components/ui/separator'
import { useEventFilters } from '@/composables/useEventFilters'
import { useLogStream } from '@/composables/useLogStream'
import { useReadState } from '@/composables/useReadState'
import { parseLogMessage } from '@/lib/log-events'
import type { LogEntry } from '@/types'

const { connected, logsByRoom, rooms } = useLogStream()
const { isEventEnabled, toggleEvent } = useEventFilters()
const { firstUnreadIndex, markReadThrough } = useReadState()
const isEventsPage = window.location.pathname === '/events'
const openRooms = ref<string[]>([])
const activeRoom = ref<string | null>(null)
const roomRows = computed(() => [openRooms.value.slice(0, 6), openRooms.value.slice(6, 12)])
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

function openRoom(room: string) {
  if (!openRooms.value.includes(room) && openRooms.value.length < 12) {
    openRooms.value.push(room)
  }
  if (openRooms.value.includes(room)) activeRoom.value = room
}

function closeRoom(room: string) {
  openRooms.value = openRooms.value.filter((openRoom) => openRoom !== room)
  if (activeRoom.value === room) activeRoom.value = null
}

function readThrough(room: string, log: LogEntry) {
  markReadThrough(room, log, visibleLogsByRoom.value[room] ?? [])
}
</script>

<template>
  <EventSettings
    v-if="isEventsPage"
    :rooms="rooms"
    :logs-by-room="logsByRoom"
    :is-event-enabled="isEventEnabled"
    :toggle-event="toggleEvent"
  />

  <div v-else class="flex h-dvh overflow-hidden bg-background text-foreground">
    <RoomList
      :connected="connected"
      :rooms="rooms"
      :open-rooms="openRooms"
      :unread-by-room="unreadByRoom"
      @select="openRoom"
    />

    <Separator orientation="vertical" />

    <main
      v-if="openRooms.length"
      class="flex min-h-0 min-w-0 flex-1 flex-col divide-y"
    >
      <div
        v-for="(row, rowIndex) in roomRows"
        v-show="row.length"
        :key="rowIndex"
        class="flex min-h-0 flex-1 divide-x"
      >
        <ChannelPanel
          v-for="room in row"
          :key="room"
          class="flex-1"
          :active="activeRoom === room"
          :first-unread-index="firstUnreadIndex(room, visibleLogsByRoom[room] ?? [])"
          :logs="visibleLogsByRoom[room] ?? []"
          :room="room"
          @activate="activeRoom = room"
          @close="closeRoom(room)"
          @read-through="readThrough(room, $event)"
        />
      </div>
    </main>

    <main v-else class="grid min-w-0 flex-1 place-items-center bg-muted/10 p-4 text-center">
      <p class="text-xs text-muted-foreground">Выберите комнату</p>
    </main>
  </div>
</template>
