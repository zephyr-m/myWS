<script setup lang="ts">
import { computed, ref } from 'vue'
import ChannelPanel from '@/components/ChannelPanel.vue'
import RoomList from '@/components/RoomList.vue'
import { Separator } from '@/components/ui/separator'
import { useLogStream } from '@/composables/useLogStream'

const { connected, logsByRoom, rooms } = useLogStream()
const openRooms = ref<string[]>([])
const roomRows = computed(() => [openRooms.value.slice(0, 6), openRooms.value.slice(6, 12)])

function openRoom(room: string) {
  if (!openRooms.value.includes(room) && openRooms.value.length < 12) {
    openRooms.value.push(room)
  }
}

function closeRoom(room: string) {
  openRooms.value = openRooms.value.filter((openRoom) => openRoom !== room)
}
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-background text-foreground">
    <RoomList
      :connected="connected"
      :rooms="rooms"
      :open-rooms="openRooms"
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
          :logs="logsByRoom[room] ?? []"
          :room="room"
          @close="closeRoom(room)"
        />
      </div>
    </main>

    <main v-else class="grid min-w-0 flex-1 place-items-center bg-muted/10 p-4 text-center">
      <p class="text-xs text-muted-foreground">Выберите комнату</p>
    </main>
  </div>
</template>
