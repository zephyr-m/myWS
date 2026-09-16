<script setup lang="ts">
import { useEventKinds } from '@/composables/useEventKinds'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Check, Copy, Settings } from '@lucide/vue'
import JsonTree from '@/components/JsonTree.vue'
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

const { kindForLog } = useEventKinds()
const viewport = ref<HTMLElement | null>(null)
const copiedLogId = ref<string | null>(null)
const unreadCount = computed(() => props.logs.length - props.firstUnreadIndex)
let positioning = false
let readingArmed = false
let initialPositionDone = false
let copyResetTimer: number | undefined

watch(() => props.active, (active) => {
  if (!active) readingArmed = false
})

onMounted(async () => {
  await nextTick()
  positionInitialHistory()
})

watch(() => props.logs.length, async (length) => {
  if (!length || initialPositionDone) return
  await nextTick()
  positionInitialHistory()
})

function positionInitialHistory() {
  if (!viewport.value || !props.logs.length || initialPositionDone) return
  initialPositionDone = true
  positionAtUnread()
}

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

function eventSettingsUrl(log: LogEntry) {
  const query = new URLSearchParams({
    room: log.room,
    source: log.sourceRoom ?? log.room,
    event: parseLogMessage(log.message).event,
  })
  return `/events?${query}`
}

async function copyMessage(log: LogEntry) {
  await navigator.clipboard.writeText(parseLogMessage(log.message).message)
  copiedLogId.value = log.id
  window.clearTimeout(copyResetTimer)
  copyResetTimer = window.setTimeout(() => {
    copiedLogId.value = null
  }, 1_500)
}

onUnmounted(() => window.clearTimeout(copyResetTimer))

const structuredMessageCache = new WeakMap<LogEntry, ReturnType<typeof parseStructuredMessage>>()

function structuredMessage(log: LogEntry) {
  let content = structuredMessageCache.get(log)
  if (!content) {
    content = parseStructuredMessage(log.message)
    structuredMessageCache.set(log, content)
  }
  return content
}

function parseStructuredMessage(rawMessage: string) {
  const message = parseLogMessage(rawMessage).message
  const lines = message.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const json = lines.slice(index).join('\n').trim()
    if (!json.startsWith('{') && !json.startsWith('[')) continue

    try {
      return {
        json: JSON.parse(json) as unknown,
        text: lines.slice(0, index).join('\n').trimEnd(),
      }
    } catch {
      // Keep looking for a valid JSON suffix.
    }
  }

  return { json: undefined, text: message }
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
            :style="{ borderColor: index >= firstUnreadIndex ? kindForLog(log).color : 'transparent' }"
          >
            <div
              class="relative min-w-0 max-w-[90%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 pr-9"
              :style="{ backgroundColor: kindForLog(log).color + '18' }"
            >
              <button
                type="button"
                class="absolute right-2 top-2 grid size-6 place-items-center rounded text-muted-foreground opacity-60 hover:bg-background/60 hover:text-foreground hover:opacity-100"
                :title="copiedLogId === log.id ? 'Скопировано' : 'Скопировать сообщение'"
                @click.stop="copyMessage(log)"
              >
                <Check v-if="copiedLogId === log.id" class="size-3.5 text-emerald-500" />
                <Copy v-else class="size-3.5" />
              </button>
              <span class="mb-1.5 flex min-w-0 items-center gap-1 font-mono text-sm font-semibold" :style="{ color: kindForLog(log).color }">
                <span class="truncate">{{ parseLogMessage(log.message).event }}</span>
                <a :href="eventSettingsUrl(log)" class="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  :aria-label="`Настроить событие ${parseLogMessage(log.message).event}`" title="Настроить событие" @pointerdown.stop @click.stop>
                  <Settings class="size-3.5" />
                </a>
              </span>
              <details v-if="(log.count ?? 1) > 1" class="mb-2 text-xs text-muted-foreground">
                <summary class="cursor-pointer text-sky-600">×{{ log.count }} · Последние {{ log.times?.length ?? 0 }} получений</summary>
                <p v-if="log.firstAt" class="mt-1">Первое: {{ new Date(log.firstAt).toLocaleString('ru') }}</p>
                <ol class="mt-1 list-inside list-decimal">
                  <li v-for="(at, timeIndex) in log.times" :key="timeIndex">{{ new Date(at).toLocaleString('ru') }}.{{ at.slice(20, 23) }}</li>
                </ol>
              </details>
              <template v-for="content in [structuredMessage(log)]" :key="log.id">
                <pre v-if="content.text" class="whitespace-pre-wrap break-words font-mono text-xs leading-5">{{ content.text }}</pre>
                <JsonTree
                  v-if="content.json !== undefined"
                  class="mt-2 font-mono text-xs"
                  :value="content.json"
                />
              </template>
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
