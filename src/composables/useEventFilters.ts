import { ref } from 'vue'

const storageKey = 'live-logs.disabled-events'
const disabledByRoom = ref<Record<string, string[]>>(loadFilters())

function loadFilters() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

export function useEventFilters() {
  function isEventEnabled(room: string, event: string) {
    return !disabledByRoom.value[room]?.includes(event)
  }

  function toggleEvent(room: string, event: string) {
    const disabled = new Set(disabledByRoom.value[room] ?? [])
    if (disabled.has(event)) disabled.delete(event)
    else disabled.add(event)

    disabledByRoom.value = { ...disabledByRoom.value, [room]: [...disabled] }
    localStorage.setItem(storageKey, JSON.stringify(disabledByRoom.value))
  }

  return { isEventEnabled, toggleEvent }
}
