<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { LogEntry } from '@/types'

const props = defineProps<{
  logs: LogEntry[]
  room: string | null
}>()

const viewport = ref<HTMLElement | null>(null)

watch([() => props.room, () => props.logs.length], async () => {
  await nextTick()
  if (viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight
})

function displayTime(timestamp: string) {
  return new Intl.DateTimeFormat('ru', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}
</script>

<template>
  <div ref="viewport" class="min-h-0 flex-1 overflow-y-scroll">
    <div v-if="!room" class="grid min-h-[calc(100dvh-4rem)] place-items-center p-6">
      <p class="text-sm text-muted-foreground">Пока нет активных комнат</p>
    </div>

    <div
      v-else-if="logs.length === 0"
      class="grid min-h-[calc(100dvh-4rem)] place-items-center p-6 text-center"
    >
      <div>
        <p class="text-sm font-medium">Ожидание логов</p>
        <p class="mt-2 text-xs text-muted-foreground">
          Подключитесь к
          <code class="rounded bg-muted px-1.5 py-1 font-mono">/api/logs?room={{ room }}</code>
        </p>
      </div>
    </div>

    <div v-else class="mx-auto flex max-w-5xl flex-col gap-2 p-4 sm:p-6">
      <article v-for="log in logs" :key="log.id" class="flex items-end gap-2">
        <div class="min-w-0 max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5">
          <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-5">{{ log.message }}</pre>
        </div>
        <time class="mb-1 shrink-0 text-[10px] text-muted-foreground">
          {{ displayTime(log.at) }}
        </time>
      </article>
    </div>
  </div>
</template>
