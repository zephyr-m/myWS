import { computed, ref } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'
import { parseLogMessage } from '@/lib/log-events'
import { migrateTypes, normalizeTypes, type EventKind, type EventTypeSettings } from '@/lib/event-types'
import type { LogEntry } from '@/types'

const storageKey = 'live-logs.event-types'
function readLocal(): EventTypeSettings {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? normalizeTypes(JSON.parse(stored)) : migrateTypes(JSON.parse(localStorage.getItem('live-logs.error-events') ?? '{}'))
  } catch { return migrateTypes() }
}
const config = ref(readLocal())
let started = false
let revision = 0
window.addEventListener('storage', (event) => {
  if (event.key !== storageKey) return
  config.value = readLocal()
  revision++
})
function persist() {
  revision++
  localStorage.setItem(storageKey, JSON.stringify(config.value))
  saveSettings({ eventTypes: config.value })
}
export function useEventKinds() {
  if (!started) {
    started = true
    const initialRevision = revision
    void loadSettings().then((settings) => {
      if (!settings || revision !== initialRevision) return
      config.value = settings.eventTypes ? normalizeTypes(settings.eventTypes)
        : settings.errorEvents ? migrateTypes(settings.errorEvents) : config.value
      localStorage.setItem(storageKey, JSON.stringify(config.value))
      if (!settings.eventTypes) saveSettings({ eventTypes: config.value })
    })
  }
  const types = computed(() => config.value.types)
  const assignments = computed(() => config.value.assignments)
  function kindForEvent(room: string, event: string) {
    const id = config.value.assignments[JSON.stringify([room, event])] ?? 'info'
    return types.value.find((kind) => kind.id === id) ?? types.value.find((kind) => kind.id === 'info')!
  }
  function kindForLog(log: LogEntry) {
    return kindForEvent(log.sourceRoom ?? log.room, parseLogMessage(log.message).event)
  }
  function setEventKind(room: string, event: string, id: string) {
    if (!types.value.some((kind) => kind.id === id)) return
    config.value.assignments = { ...config.value.assignments, [JSON.stringify([room, event])]: id }
    persist()
  }
  function saveKind(kind: EventKind) {
    if (!kind.name.trim() || types.value.some((item) => item.id !== kind.id && item.name.toLocaleLowerCase() === kind.name.trim().toLocaleLowerCase())) {
      throw new Error('Укажите уникальное название типа')
    }
    const next = normalizeTypes({ ...config.value, types: [...types.value.filter((item) => item.id !== kind.id), kind] })
    if (!next.types.some((item) => item.id === kind.id)) throw new Error('Проверьте цвет, звук и громкость')
    // Keep existing order when editing.
    config.value.types = types.value.some((item) => item.id === kind.id)
      ? types.value.map((item) => item.id === kind.id ? { ...kind, name: kind.name.trim() } : item)
      : next.types
    persist()
  }
  function deleteKind(id: string, replacement: string) {
    if (id === 'info' || id === replacement || !types.value.some((kind) => kind.id === replacement)) return
    config.value = { types: types.value.filter((kind) => kind.id !== id), assignments: Object.fromEntries(
      Object.entries(assignments.value).map(([key, kind]) => [key, kind === id ? replacement : kind])) }
    persist()
  }
  return { types, assignments, kindForEvent, kindForLog, setEventKind, saveKind, deleteKind }
}
