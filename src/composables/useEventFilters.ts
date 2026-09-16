import { ref } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'

const eventStorageKey = 'live-logs.disabled-events'
const enabledRoomsStorageKey = 'live-logs.enabled-notification-rooms'
const notificationStorageKey = 'live-logs.enabled-notifications'
const disabledByRoom = ref<Record<string, string[]>>(loadFilters(eventStorageKey))
const enabledNotificationsByRoom = ref<Record<string, string[]>>(loadFilters(notificationStorageKey))
const enabledNotificationRooms = ref<string[]>(loadRoomList())
let hydrationStarted = false
let localRevision = 0

function loadFilters(storageKey: string) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

function loadRoomList() {
  try {
    const rooms: unknown = JSON.parse(localStorage.getItem(enabledRoomsStorageKey) ?? '[]')
    return Array.isArray(rooms) ? rooms.filter((room): room is string => typeof room === 'string') : []
  } catch {
    return []
  }
}

window.addEventListener('storage', (event) => {
  if (![eventStorageKey, notificationStorageKey, enabledRoomsStorageKey].includes(event.key ?? '')) return
  if (event.key === eventStorageKey) disabledByRoom.value = loadFilters(eventStorageKey)
  if (event.key === notificationStorageKey) {
    enabledNotificationsByRoom.value = loadFilters(notificationStorageKey)
  }
  if (event.key === enabledRoomsStorageKey) enabledNotificationRooms.value = loadRoomList()
  localRevision += 1
})

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
    return isRoomNotificationEnabled(room)
      && (enabledNotificationsByRoom.value[room]?.includes(event) ?? false)
  }

  function isRoomNotificationEnabled(room: string) {
    return enabledNotificationRooms.value.includes(room)
  }

  function toggleNotification(room: string, event: string) {
    const enabled = new Set(enabledNotificationsByRoom.value[room] ?? [])
    if (enabled.has(event)) enabled.delete(event)
    else enabled.add(event)

    enabledNotificationsByRoom.value = {
      ...enabledNotificationsByRoom.value,
      [room]: [...enabled],
    }
    localStorage.setItem(notificationStorageKey, JSON.stringify(enabledNotificationsByRoom.value))
    localRevision += 1
    saveSettings({ enabledNotificationEvents: enabledNotificationsByRoom.value })
  }

  function toggleRoomNotifications(room: string) {
    const enabled = new Set(enabledNotificationRooms.value)
    if (enabled.has(room)) enabled.delete(room)
    else enabled.add(room)

    enabledNotificationRooms.value = [...enabled]
    localStorage.setItem(enabledRoomsStorageKey, JSON.stringify(enabledNotificationRooms.value))
    localRevision += 1
    saveSettings({ enabledNotificationRooms: enabledNotificationRooms.value })
  }

  return {
    isEventEnabled,
    isNotificationEnabled,
    isRoomNotificationEnabled,
    toggleEvent,
    toggleNotification,
    toggleRoomNotifications,
  }
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

    if (settings.enabledNotificationEvents) {
      enabledNotificationsByRoom.value = settings.enabledNotificationEvents
      localStorage.setItem(
        notificationStorageKey,
        JSON.stringify(enabledNotificationsByRoom.value),
      )
    } else {
      saveSettings({ enabledNotificationEvents: enabledNotificationsByRoom.value })
    }

    if (settings.enabledNotificationRooms) {
      enabledNotificationRooms.value = settings.enabledNotificationRooms
      localStorage.setItem(enabledRoomsStorageKey, JSON.stringify(enabledNotificationRooms.value))
    } else {
      saveSettings({ enabledNotificationRooms: enabledNotificationRooms.value })
    }
  })
}
