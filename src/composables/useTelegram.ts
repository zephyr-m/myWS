import { onMounted, onUnmounted, ref } from 'vue'

interface TelegramState {
  configured: boolean
  pending: number
  dropped: number
  lastError: string
  events: { room: string; event: string }[]
}
export function useTelegram() {
  const state = ref<TelegramState>({ configured: false, pending: 0, dropped: 0, lastError: '', events: [] })
  const busy = ref(false)
  const loaded = ref(false)
  const error = ref('')
  let timer: number | undefined
  let revision = 0
  async function refresh() {
    const current = revision
    try {
      const response = await fetch('/api/telegram', { cache: 'no-store' })
      if (!response.ok) throw new Error()
      const next: TelegramState = await response.json()
      if (revision !== current) return
      state.value = next
      loaded.value = true
      error.value = ''
    } catch { if (revision === current) error.value = 'Не удалось загрузить состояние Telegram' }
  }
  onMounted(() => { void refresh(); timer = window.setInterval(() => { if (!busy.value) void refresh() }, 10000) })
  onUnmounted(() => window.clearInterval(timer))
  function enabled(room: string, event: string) {
    return state.value.events.some((item) => item.room === room && item.event === event)
  }
  async function toggle(room: string, event: string) {
    if (busy.value || !loaded.value) return
    busy.value = true
    revision++
    try {
      const response = await fetch('/api/telegram', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room, event, enabled: !enabled(room, event) }),
      })
      if (!response.ok) throw new Error()
      state.value = await response.json()
      error.value = ''
    } catch { error.value = 'Не удалось сохранить настройку Telegram' }
    finally { revision++; busy.value = false }
  }
  return { state, busy, loaded, error, enabled, toggle }
}
