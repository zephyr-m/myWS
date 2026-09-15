<script setup lang="ts">
defineProps<{
  rooms: string[]
  activeRoom: string | null
  unreadByRoom: Record<string, number>
}>()
defineEmits<{ select: [room: string]; close: [room: string] }>()
</script>

<template>
  <nav class="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/25 px-1 pt-1" aria-label="Открытые комнаты">
    <div v-for="room in rooms" :key="room"
      class="flex min-w-28 max-w-64 shrink-0 items-center rounded-t-md border border-b-0"
      :class="activeRoom === room ? 'bg-background border-t-sky-500' : 'bg-muted/50'">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-xs" :title="room"
        :aria-current="activeRoom === room ? 'page' : undefined" @click="$emit('select', room)">
        <span class="truncate"># {{ room }}</span>
        <span v-if="unreadByRoom[room]" class="rounded-full bg-sky-500 px-1.5 text-white">{{ unreadByRoom[room] }}</span>
      </button>
      <button type="button" class="mx-1 size-6 shrink-0 rounded hover:bg-muted" :aria-label="`Закрыть вкладку ${room}`"
        @click="$emit('close', room)">×</button>
    </div>
    <span v-if="!rooms.length" class="p-2 text-xs text-muted-foreground">Откройте комнату из списка</span>
  </nav>
</template>
