import { onMounted, onUnmounted, reactive, ref } from 'vue'
import type { LogEntry, RoomSummary, StreamEvent } from '@/types'

const reconnectDelay = 1_500

export function useLogStream(onLog?: (log: LogEntry) => void) {
  const connected = ref(false)
  const rooms = ref<RoomSummary[]>([])
  const logsByRoom = reactive<Record<string, LogEntry[]>>({})

  let socket: WebSocket | null = null
  let reconnectTimer: number | undefined
  let stopped = false

  function streamUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/stream`
  }

  function applyEvent(event: StreamEvent) {
    if (event.type === 'snapshot') {
      rooms.value = event.payload.rooms

      for (const room of Object.keys(logsByRoom)) {
        delete logsByRoom[room]
      }

      Object.assign(logsByRoom, event.payload.logs)
      return
    }

    if (event.type === 'rooms') {
      rooms.value = event.payload
      return
    }

    const roomLogs = logsByRoom[event.payload.room] ?? []
    roomLogs.push(event.payload)
    logsByRoom[event.payload.room] = roomLogs
    onLog?.(event.payload)
  }

  function connect() {
    window.clearTimeout(reconnectTimer)
    socket = new WebSocket(streamUrl())

    socket.addEventListener('open', () => {
      connected.value = true
    })

    socket.addEventListener('message', (message) => {
      try {
        applyEvent(JSON.parse(String(message.data)) as StreamEvent)
      } catch {
        // Ignore malformed server messages and keep the live connection running.
      }
    })

    socket.addEventListener('close', () => {
      connected.value = false
      if (!stopped) reconnectTimer = window.setTimeout(connect, reconnectDelay)
    })

    socket.addEventListener('error', () => socket?.close())
  }

  onMounted(connect)
  onUnmounted(() => {
    stopped = true
    window.clearTimeout(reconnectTimer)
    socket?.close()
  })

  return { connected, logsByRoom, rooms }
}
