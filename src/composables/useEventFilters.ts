import { ref } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'

const eventStorageKey = 'live-logs.disabled-events'
const notificationStorageKey = 'live-logs.disabled-notifications'
const disabledByRoom = ref<Record<string, string[]>>(loadFilters(eventStorageKey))
const disabledNotificationsByRoom = ref<Record<string, string[]>>(loadFilters(notificationStorageKey))
let hydrationStarted = false
let localRevision = 0

function loadFilters(storageKey: string) {
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
    localStorage.setItem(eventStorageKey, JSON.stringify(disabledByRoom.value))
    localRevision += 1
    saveSettings({ eventFilters: disabledByRoom.value })
  }

  function isNotificationEnabled(room: string, event: string) {
    return !disabledNotificationsByRoom.value[room]?.includes(event)
  }

  function toggleNotification(room: string, event: string) {
    const disabled = new Set(disabledNotificationsByRoom.value[room] ?? [])
    if (disabled.has(event)) disabled.delete(event)
    else disabled.add(event)

    disabledNotificationsByRoom.value = {
      ...disabledNotificationsByRoom.value,
      [room]: [...disabled],
    }
    localStorage.setItem(notificationStorageKey, JSON.stringify(disabledNotificationsByRoom.value))
    localRevision += 1
    saveSettings({ notificationFilters: disabledNotificationsByRoom.value })
  }

  return { isEventEnabled, isNotificationEnabled, toggleEvent, toggleNotification }
}

function hydrateFilters() {
  if (hydrationStarted) return
  hydrationStarted = true
  const revision = localRevision

  loadSettings().then((settings) => {
    if (!settings || localRevision !== revision) return
    if (settings.eventFilters) {
      disabledByRoom.value = settings.eventFilters
      localStorage.setItem(eventStorageKey, JSON.stringify(disabledByRoom.value))
    } else {
      saveSettings({ eventFilters: disabledByRoom.value })
    }

    if (settings.notificationFilters) {
      disabledNotificationsByRoom.value = settings.notificationFilters
      localStorage.setItem(
        notificationStorageKey,
        JSON.stringify(disabledNotificationsByRoom.value),
      )
    } else {
      saveSettings({ notificationFilters: disabledNotificationsByRoom.value })
    }
  })
}
