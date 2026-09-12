<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { parseLogMessage } from '@/lib/log-events'
import type { LogEntry } from '@/types'

const props = defineProps<{
  active: boolean
  firstUnreadIndex: number
  logs: LogEntry[]
  room: string | null
}>()

const emit = defineEmits<{
  activate: []
  readThrough: [log: LogEntry]
}>()

const viewport = ref<HTMLElement | null>(null)
const unreadCount = computed(() => props.logs.length - props.firstUnreadIndex)
let positioning = false
let readingArmed = false

watch(() => props.active, (active) => {
  if (!active) readingArmed = false
})

onMounted(async () => {
  await nextTick()
  positionAtUnread()
})

function positionAtUnread(smooth = false) {
  if (!viewport.value) return
  const target = viewport.value.querySelector<HTMLElement>('[data-unread-marker]')
  const top = target
    ? target.getBoundingClientRect().top - viewport.value.getBoundingClientRect().top + viewport.value.scrollTop - 16
    : viewport.value.scrollHeight

  positioning = true
  viewport.value.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' })
  requestAnimationFrame(() => {
    positioning = false
    if (smooth) markVisibleAsRead()
  })
}

function markVisibleAsRead() {
  if (!props.active || !readingArmed || positioning || !viewport.value) return
  const bottom = viewport.value.getBoundingClientRect().bottom
  const visible = [...viewport.value.querySelectorAll<HTMLElement>('[data-log-index]')]
    .filter((element) => element.getBoundingClientRect().bottom <= bottom + 1)
    .at(-1)
  const index = Number(visible?.dataset.logIndex)
  if (Number.isInteger(index) && index >= props.firstUnreadIndex) {
    emit('readThrough', props.logs[index])
  }
}

function activate() {
  readingArmed = true
  emit('activate')
  nextTick(markVisibleAsRead)
}

function goToUnread() {
  readingArmed = true
  emit('activate')
  positioning = false
  positionAtUnread(true)
}

function displayTime(timestamp: string) {
  return new Intl.DateTimeFormat('ru', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}
</script>

<template>
  <div class="relative min-h-0 flex-1">
    <div
      ref="viewport"
      class="h-full overflow-y-scroll"
      tabindex="0"
      @pointerdown="activate"
      @wheel.passive="activate"
      @scroll.passive="markVisibleAsRead"
      @keydown="activate"
    >
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
        <template v-for="(log, index) in logs" :key="log.id">
          <div
            v-if="index === firstUnreadIndex"
            data-unread-marker
            class="my-2 flex items-center gap-2 text-[10px] font-medium text-sky-600"
          >
            <span class="h-px flex-1 bg-sky-500/40" />
            Непрочитанные · {{ unreadCount }}
            <span class="h-px flex-1 bg-sky-500/40" />
          </div>
          <article
            :data-log-index="index"
            :data-unread="index >= firstUnreadIndex"
            class="flex items-end gap-2 border-l-2 pl-2"
            :class="index >= firstUnreadIndex ? 'border-sky-500' : 'border-transparent'"
          >
            <div
              class="min-w-0 max-w-[90%] rounded-2xl rounded-bl-sm px-3.5 py-2.5"
              :class="index >= firstUnreadIndex ? 'bg-sky-500/10' : 'bg-muted'"
            >
              <span class="mb-1 block truncate font-mono text-[10px] text-muted-foreground">
                {{ parseLogMessage(log.message).event }}
              </span>
              <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-5">{{ parseLogMessage(log.message).message }}</pre>
            </div>
            <time class="mb-1 shrink-0 text-[10px] text-muted-foreground">
              {{ displayTime(log.at) }}
            </time>
          </article>
        </template>
      </div>
    </div>

    <button
      v-if="unreadCount > 0"
      type="button"
      class="absolute bottom-4 right-4 rounded-full bg-sky-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-sky-600"
      @click="goToUnread"
    >
      ↓ Новые · {{ unreadCount }}
    </button>
  </div>
</template>
