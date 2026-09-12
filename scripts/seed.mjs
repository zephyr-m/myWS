import { WebSocket } from 'ws'

const baseUrl = process.env.LOG_SERVER_URL ?? 'ws://ws.local/api/logs'
const rooms = [
  'frontend',
  'backend',
  'auth',
  'payments',
  'database',
  'notifications',
  'orders',
  'delivery',
  'analytics',
  'gateway',
  'worker',
  'system',
]

function fillRoom(room) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}?room=${encodeURIComponent(room)}`)

    socket.once('open', () => {
      socket.send(JSON.stringify({ event: 'request.received', message: `[${room}] Получен запрос` }))
      socket.send(JSON.stringify({ event: 'database.query', message: `[${room}] Выполнен запрос к БД` }))
      socket.send(JSON.stringify({ event: 'response.sent', message: `[${room}] Отправлен ответ` }), (error) => {
        if (error) return reject(error)
        setTimeout(() => socket.close(), 100)
      })
    })

    socket.once('close', resolve)
    socket.once('error', reject)
  })
}

await Promise.all(rooms.map(fillRoom))
console.log(`Создано комнат: ${rooms.length}. Отправлено сообщений: ${rooms.length * 3}.`)
