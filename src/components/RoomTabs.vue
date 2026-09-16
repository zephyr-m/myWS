<script setup lang="ts">
import UnreadBadges from '@/components/UnreadBadges.vue'
import { computed, ref } from 'vue'
import { Pin, Ellipsis } from '@lucide/vue'
const props = defineProps<{
  rooms: string[]
  pinnedRooms: string[]
  activeRoom: string | null
  errorsByRoom: Record<string, number>
  unreadByRoom: Record<string, number>
}>()
defineEmits<{
  select: [room: string]; close: [room: string]; pin: [room: string]
  readAll: [room: string]; clear: [room: string]
}>()
const sortedRooms = computed(() => [
  ...props.rooms.filter((room) => props.pinnedRooms.includes(room)),
  ...props.rooms.filter((room) => !props.pinnedRooms.includes(room)),
])
const menu = ref<HTMLDialogElement | null>(null)
const menuRoom = ref('')
function showMenu(room: string) {
  menuRoom.value = room
  menu.value?.showModal()
}
</script>

<template>
  <nav class="flex min-h-10 shrink-0 flex-wrap items-end gap-1 border-b bg-muted/25 p-1" aria-label="Открытые комнаты">
    <div v-for="room in sortedRooms" :key="room"
      class="flex min-w-0 max-w-full shrink-0 items-center rounded border sm:max-w-72"
      :class="activeRoom === room ? 'bg-background border-t-sky-500' : 'bg-muted/50'">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-xs" :title="room"
        :aria-current="activeRoom === room ? 'page' : undefined" @click="$emit('select', room)">
        <span class="truncate"># {{ room }}</span>
        <UnreadBadges :normal="unreadByRoom[room]" :errors="errorsByRoom[room]" />
      </button>
      <button type="button" class="ml-1 grid size-6 shrink-0 place-items-center rounded hover:bg-muted"
        :class="pinnedRooms.includes(room) ? 'text-sky-500' : 'text-muted-foreground'"
        :aria-pressed="pinnedRooms.includes(room)"
        :aria-label="`${pinnedRooms.includes(room) ? 'Открепить' : 'Закрепить'} вкладку ${room}`"
        :title="pinnedRooms.includes(room) ? 'Открепить вкладку' : 'Закрепить вкладку'" @click="$emit('pin', room)">
        <Pin class="size-3.5" />
      </button>
      <button type="button" class="grid size-6 shrink-0 place-items-center rounded hover:bg-muted"
        :aria-label="`Действия с вкладкой ${room}`" title="Действия" @click="showMenu(room)"><Ellipsis class="size-4" /></button>
      <button v-if="!pinnedRooms.includes(room)" type="button" class="mr-1 size-6 shrink-0 rounded hover:bg-muted" :aria-label="`Закрыть вкладку ${room}`"
        @click="$emit('close', room)">×</button>
    </div>
    <span v-if="!rooms.length" class="p-2 text-xs text-muted-foreground">Откройте комнату из списка</span>
  </nav>
  <dialog ref="menu" class="m-auto w-full max-w-sm rounded-lg border bg-background p-4 text-foreground shadow-lg backdrop:bg-black/40"
    aria-labelledby="tab-actions-title" @click="($event.target === menu) && menu?.close()">
    <h2 id="tab-actions-title" class="mb-3 truncate text-sm font-semibold"># {{ menuRoom }}</h2>
    <button type="button" class="block w-full rounded p-2 text-left text-sm hover:bg-muted"
      @click="$emit('readAll', menuRoom); menu?.close()">Прочитать всё</button>
    <button type="button" class="block w-full rounded p-2 text-left text-sm text-destructive hover:bg-muted"
      @click="menu?.close(); $emit('clear', menuRoom)">Очистить историю…</button>
    <button type="button" class="mt-2 block w-full rounded p-2 text-sm hover:bg-muted" @click="menu?.close()">Отмена</button>
  </dialog>
</template>
