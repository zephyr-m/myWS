import { ref } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'

const eventStorageKey = 'live-logs.disabled-events'
const mutedRoomsStorageKey = 'live-logs.muted-notification-rooms'
const notificationStorageKey = 'live-logs.disabled-notifications'
const disabledByRoom = ref<Record<string, string[]>>(loadFilters(eventStorageKey))
const disabledNotificationsByRoom = ref<Record<string, string[]>>(loadFilters(notificationStorageKey))
const mutedNotificationRooms = ref<string[]>(loadRoomList())
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
    const rooms: unknown = JSON.parse(localStorage.getItem(mutedRoomsStorageKey) ?? '[]')
    return Array.isArray(rooms) ? rooms.filter((room): room is string => typeof room === 'string') : []
  } catch {
    return []
  }
}

window.addEventListener('storage', (event) => {
  if (![eventStorageKey, notificationStorageKey, mutedRoomsStorageKey].includes(event.key ?? '')) return
  if (event.key === eventStorageKey) disabledByRoom.value = loadFilters(eventStorageKey)
  if (event.key === notificationStorageKey) {
    disabledNotificationsByRoom.value = loadFilters(notificationStorageKey)
  }
  if (event.key === mutedRoomsStorageKey) mutedNotificationRooms.value = loadRoomList()
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
      && !disabledNotificationsByRoom.value[room]?.includes(event)
  }

  function isRoomNotificationEnabled(room: string) {
    return !mutedNotificationRooms.value.includes(room)
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

  function toggleRoomNotifications(room: string) {
    const muted = new Set(mutedNotificationRooms.value)
    if (muted.has(room)) muted.delete(room)
    else muted.add(room)

    mutedNotificationRooms.value = [...muted]
    localStorage.setItem(mutedRoomsStorageKey, JSON.stringify(mutedNotificationRooms.value))
    localRevision += 1
    saveSettings({ mutedNotificationRooms: mutedNotificationRooms.value })
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

    if (settings.notificationFilters) {
      disabledNotificationsByRoom.value = settings.notificationFilters
      localStorage.setItem(
        notificationStorageKey,
        JSON.stringify(disabledNotificationsByRoom.value),
      )
    } else {
      saveSettings({ notificationFilters: disabledNotificationsByRoom.value })
    }

    if (settings.mutedNotificationRooms) {
      mutedNotificationRooms.value = settings.mutedNotificationRooms
      localStorage.setItem(mutedRoomsStorageKey, JSON.stringify(mutedNotificationRooms.value))
    } else {
      saveSettings({ mutedNotificationRooms: mutedNotificationRooms.value })
    }
  })
}
