<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useEventKinds } from '@/composables/useEventKinds'
import { badgeTextColor, defaultKinds, playKindSound, soundOptions, type EventKind } from '@/lib/event-types'
const { types, assignments, saveKind, deleteKind } = useEventKinds()
const selected = ref('info')
const draft = ref<EventKind>({ ...defaultKinds[0]! })
const feedback = ref('')
const replacement = ref('info')
let audio: AudioContext | null = null
const colors = ['#0ea5e9', '#ef4444', '#eab308', '#22c55e', '#a855f7', '#f97316', '#64748b']
const usage = computed(() => Object.values(assignments.value).filter((id) => id === selected.value).length)
const stored = computed(() => types.value.find((kind) => kind.id === selected.value))
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(stored.value))
watch(stored, (kind) => { if (kind) draft.value = { ...kind } }, { immediate: true })
watch(selected, (id) => {
  if (replacement.value === id || !types.value.some((kind) => kind.id === replacement.value)) replacement.value = 'info'
})
function canLeave() { return !dirty.value || window.confirm('Отменить несохранённые изменения?') }
function select(id: string) {
  if (!canLeave()) return
  selected.value = id
  feedback.value = ''
}
function add() {
  if (!canLeave()) return
  selected.value = crypto.randomUUID()
  draft.value = { id: selected.value, name: '', color: '#eab308', sound: 'beep', volume: 0.5 }
  feedback.value = ''
}
function save() {
  try { saveKind(draft.value); feedback.value = 'Сохранено' }
  catch (error) { feedback.value = error instanceof Error ? error.message : 'Не удалось сохранить' }
}
async function listen() {
  try {
    audio ??= new AudioContext()
    await audio.resume()
    playKindSound(audio, draft.value)
    feedback.value = draft.value.sound === 'none' || !draft.value.volume ? 'Для этого типа звук выключен' : 'Воспроизводится выбранный звук'
  } catch { feedback.value = 'Не удалось включить звук в браузере' }
}
function remove() {
  if (!window.confirm(`Удалить тип «${draft.value.name}»? Назначенные события получат выбранный тип замены.`)) return
  deleteKind(selected.value, replacement.value)
  selected.value = replacement.value
  feedback.value = 'Тип удалён'
}
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onUnmounted(() => { window.removeEventListener('beforeunload', beforeUnload); void audio?.close() })
</script>

<template>
  <main class="min-h-dvh bg-background text-foreground">
    <header class="flex items-center gap-6 border-b px-6 py-4">
      <a href="/" class="text-sm text-muted-foreground">← Панель</a>
      <h1 class="font-semibold">Типы событий</h1>
      <a href="/events" class="ml-auto text-sm text-muted-foreground">Настройки событий</a>
    </header>
    <div class="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[220px_1fr]">
      <aside class="space-y-2">
        <button v-for="kind in types" :key="kind.id" type="button" class="flex w-full items-center gap-2 rounded border px-3 py-2 text-left"
          :class="selected === kind.id && 'bg-muted'" :aria-pressed="selected === kind.id" @click="select(kind.id)">
          <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: kind.color }" /><span class="truncate">{{ kind.name }}</span>
        </button>
        <button type="button" class="w-full rounded border px-3 py-2 text-sm" @click="add">+ Добавить тип</button>
      </aside>
      <form class="space-y-6 rounded-lg border p-5" @submit.prevent="save">
        <label class="block text-sm">Название
          <input v-model="draft.name" required maxlength="60" class="mt-2 block w-full rounded border bg-background p-2" />
        </label>
        <div><p class="mb-2 text-sm">Цвет</p>
          <div class="flex flex-wrap items-center gap-2">
            <button v-for="color in colors" :key="color" type="button" class="size-8 rounded-full border-2"
              :style="{ backgroundColor: color, borderColor: draft.color === color ? 'currentColor' : 'transparent' }"
              :aria-label="`Цвет ${color}`" :aria-pressed="draft.color === color" @click="draft.color = color" />
            <label class="ml-2 flex items-center gap-2 text-sm">Свой <input v-model="draft.color" type="color" class="h-8 w-10" /></label>
          </div>
        </div>
        <div class="flex items-end gap-3">
          <label class="flex-1 text-sm">Звук
            <select v-model="draft.sound" class="mt-2 block w-full rounded border bg-background p-2">
              <option v-for="sound in soundOptions" :key="sound.id" :value="sound.id">{{ sound.name }}</option>
            </select>
          </label>
          <button type="button" class="rounded border px-3 py-2 text-sm" @click="listen">▶ Слушать</button>
        </div>
        <label class="block text-sm">Громкость · {{ Math.round(draft.volume * 100) }}%
          <input v-model.number="draft.volume" type="range" min="0" max="1" step="0.05" class="mt-3 block w-full" />
        </label>
        <section class="space-y-3">
          <h2 class="text-xs uppercase text-muted-foreground">Предпросмотр</h2>
          <article class="rounded-lg border-l-2 p-4" :style="{ borderColor: draft.color, backgroundColor: draft.color + '18' }">
            <h3 class="font-mono text-sm font-semibold" :style="{ color: draft.color }">{{ draft.name || 'Новый тип' }} · Пример события</h3>
            <p class="mt-2 text-sm">Так будет выглядеть сообщение в ленте.</p>
          </article>
          <p class="flex items-center gap-2 text-sm"># backend
            <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :style="{ backgroundColor: draft.color, color: badgeTextColor(draft.color) }">7</span>
          </p>
        </section>
        <p class="text-xs text-muted-foreground">Назначено событий: {{ usage }}. Новые события получают тип «{{ types.find(kind => kind.id === 'info')?.name }}».</p>
        <div v-if="stored && selected !== 'info'" class="flex flex-wrap items-center gap-2 border-t pt-4">
          <label class="text-xs">При удалении заменить на
            <select v-model="replacement" class="ml-2 rounded border bg-background p-2">
              <option v-for="kind in types.filter(kind => kind.id !== selected)" :key="kind.id" :value="kind.id">{{ kind.name }}</option>
            </select>
          </label>
          <button type="button" class="rounded border px-3 py-2 text-xs text-destructive" @click="remove">Удалить тип</button>
        </div>
        <p v-if="selected === 'info'" class="text-xs text-muted-foreground">Тип по умолчанию можно переименовать и настроить, но нельзя удалить.</p>
        <div class="flex items-center justify-between gap-3"><p role="status" class="text-sm">{{ feedback }}</p>
          <button type="submit" class="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Сохранить</button>
        </div>
      </form>
    </div>
  </main>
</template>
