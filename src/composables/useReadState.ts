import { ref } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'
import type { LogEntry } from '@/types'

interface ReadCursor {
  id: string
  at: string
}

const storageKey = 'live-logs.read-cursors'
const cursors = ref<Record<string, ReadCursor>>(loadCursors())
let hydrationStarted = false
let localRevision = 0

function loadCursors() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, ReadCursor>
  } catch {
    return {}
  }
}

export function useReadState() {
  hydrateCursors()

  function firstUnreadIndex(room: string, logs: LogEntry[]) {
    const cursor = cursors.value[room]
    if (!cursor) return 0

    const cursorIndex = logs.findIndex((log) => log.id === cursor.id)
    if (cursorIndex >= 0) return cursorIndex + 1

    const newerIndex = logs.findIndex((log) => log.at > cursor.at)
    return newerIndex < 0 ? logs.length : newerIndex
  }

  function markReadThrough(room: string, log: LogEntry, logs: LogEntry[]) {
    const targetIndex = logs.findIndex((entry) => entry.id === log.id)
    const current = cursors.value[room]
    const currentIndex = logs.findIndex((entry) => entry.id === current?.id)

    if (targetIndex < 0 || (currentIndex >= 0 && targetIndex <= currentIndex)) return
    if (currentIndex < 0 && current && log.at < current.at) return

    cursors.value = { ...cursors.value, [room]: { id: log.id, at: log.at } }
    localStorage.setItem(storageKey, JSON.stringify(cursors.value))
    localRevision += 1
    saveSettings({ readState: cursors.value })
  }

  return { firstUnreadIndex, markReadThrough }
}

function hydrateCursors() {
  if (hydrationStarted) return
  hydrationStarted = true
  const revision = localRevision

  loadSettings().then((settings) => {
    if (!settings || localRevision !== revision) return
    if (settings.readState) {
      cursors.value = settings.readState
      localStorage.setItem(storageKey, JSON.stringify(cursors.value))
    } else {
      saveSettings({ readState: cursors.value })
    }
  })
}
