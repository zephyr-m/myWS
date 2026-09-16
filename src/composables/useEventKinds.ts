import { ref } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'
import { parseLogMessage } from '@/lib/log-events'
import type { LogEntry } from '@/types'

const storageKey = 'live-logs.error-events'
function readLocal(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') } catch { return {} }
}
const errorEvents = ref(readLocal())
let started = false
let revision = 0
window.addEventListener('storage', (event) => {
  if (event.key !== storageKey) return
  errorEvents.value = readLocal()
  revision++
})

export function useEventKinds() {
  if (!started) {
    started = true
    const initialRevision = revision
    void loadSettings().then((settings) => {
      if (!settings || revision !== initialRevision) return
      if (settings.errorEvents) {
        errorEvents.value = settings.errorEvents
        localStorage.setItem(storageKey, JSON.stringify(errorEvents.value))
      } else saveSettings({ errorEvents: errorEvents.value })
    })
  }
  function isErrorEvent(room: string, event: string) {
    return errorEvents.value[room]?.includes(event) ?? false
  }
  function isErrorLog(log: LogEntry) {
    return isErrorEvent(log.sourceRoom ?? log.room, parseLogMessage(log.message).event)
  }
  function setErrorEvent(room: string, event: string, error: boolean) {
    const events = new Set(errorEvents.value[room] ?? [])
    if (error) events.add(event)
    else events.delete(event)
    errorEvents.value = { ...errorEvents.value, [room]: [...events] }
    revision++
    localStorage.setItem(storageKey, JSON.stringify(errorEvents.value))
    saveSettings({ errorEvents: errorEvents.value })
  }
  return { errorEvents, isErrorEvent, isErrorLog, setErrorEvent }
}
