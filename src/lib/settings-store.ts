import type { EventTypeSettings } from '@/lib/event-types'

export interface ServerSettings {
  activeContourId?: string
  enabledNotificationEvents?: Record<string, string[]>
  enabledNotificationRooms?: string[]
  eventTypes?: EventTypeSettings
  errorEvents?: Record<string, string[]>
  eventFilters?: Record<string, string[]>
  hierarchy?: unknown
  mutedNotificationRooms?: string[]
  notificationFilters?: Record<string, string[]>
  readState?: Record<string, { id: string, at: string, sequence?: number }>
  updatedAt?: string
  version?: number
}

const updatedAtStorageKey = 'live-logs.settings-updated-at'
let loadPromise: Promise<ServerSettings | null> | null = null
let pendingPatch: Partial<ServerSettings> = {}
let saveTimer: number | undefined

export function loadSettings() {
  loadPromise ??= fetch('/api/settings', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() as Promise<ServerSettings> : null)
    .then((settings) => {
      if (!settings) return null
      const localUpdatedAt = localStorage.getItem(updatedAtStorageKey)
      if (localUpdatedAt && localUpdatedAt > (settings.updatedAt ?? '')) return { version: 1 }
      if (settings.updatedAt) localStorage.setItem(updatedAtStorageKey, settings.updatedAt)
      return settings
    })
    .catch(() => null)
  return loadPromise
}

export function saveSettings(patch: Partial<ServerSettings>) {
  const updatedAt = new Date().toISOString()
  localStorage.setItem(updatedAtStorageKey, updatedAt)
  pendingPatch = { ...pendingPatch, ...patch, updatedAt }
  scheduleSave()
}

function scheduleSave(delay = 400) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flushSettings, delay)
}

async function flushSettings() {
  const patch = pendingPatch
  pendingPatch = {}

  try {
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!response.ok) throw new Error('Settings were not saved')
  } catch {
    pendingPatch = { ...patch, ...pendingPatch }
    scheduleSave(2000)
  }
}
