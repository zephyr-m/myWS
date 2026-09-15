import { onMounted, ref } from 'vue'

export interface EventRoute { source: string; event: string; target: string }

export function useEventRoutes() {
  const routes = ref<EventRoute[]>([])
  const busy = ref(true)
  const error = ref('')
  const loaded = ref(false)

  onMounted(async () => {
    try {
      const response = await fetch('/api/routes', { cache: 'no-store' })
      if (!response.ok) throw new Error()
      routes.value = await response.json()
      loaded.value = true
    } catch {
      error.value = 'Не удалось загрузить маршруты. Обновите страницу.'
    } finally { busy.value = false }
  })

  async function setRoute(source: string, event: string, target: string | null) {
    busy.value = true
    error.value = ''
    try {
      const response = await fetch('/api/routes', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, event, target }),
      })
      if (!response.ok) throw new Error()
      routes.value = await response.json()
    } catch {
      error.value = 'Маршрут не сохранён. Попробуйте ещё раз.'
    } finally { busy.value = false }
  }

  return { routes, busy, error, loaded, setRoute }
}
