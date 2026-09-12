import { ref } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'

const storageKey = 'live-logs.disabled-events'
const disabledByRoom = ref<Record<string, string[]>>(loadFilters())
let hydrationStarted = false
let localRevision = 0

function loadFilters() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

export function useEventFilters() {
  hydrateFilters()

  function isEventEnabled(room: string, event: string) {
    return !disabledByRoom.value[room]?.includes(event)
  }

  function toggleEvent(room: string, event: string) {
    const disabled = new Set(disabledByRoom.value[room] ?? [])
    if (disabled.has(event)) disabled.delete(event)
    else disabled.add(event)

    disabledByRoom.value = { ...disabledByRoom.value, [room]: [...disabled] }
    localStorage.setItem(storageKey, JSON.stringify(disabledByRoom.value))
    localRevision += 1
    saveSettings({ eventFilters: disabledByRoom.value })
  }

  return { isEventEnabled, toggleEvent }
}

function hydrateFilters() {
  if (hydrationStarted) return
  hydrationStarted = true
  const revision = localRevision

  loadSettings().then((settings) => {
    if (!settings || localRevision !== revision) return
    if (settings.eventFilters) {
      disabledByRoom.value = settings.eventFilters
      localStorage.setItem(storageKey, JSON.stringify(disabledByRoom.value))
    } else {
      saveSettings({ eventFilters: disabledByRoom.value })
    }
  })
}
