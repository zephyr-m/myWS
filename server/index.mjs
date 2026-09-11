import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const port = Number(process.env.PORT ?? 8081)
const configuredHistorySize = Number(process.env.ROOM_HISTORY_SIZE ?? 500)
const historySize = Number.isFinite(configuredHistorySize)
  ? Math.max(1, configuredHistorySize)
  : 500
const distDirectory = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const roomHistory = new Map()
const producerCount = new Map()

const viewers = new WebSocketServer({ noServer: true })
const producers = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function rooms() {
  return [...roomHistory.keys()]
    .sort((first, second) => first.localeCompare(second))
    .map((name) => ({ name, producers: producerCount.get(name) ?? 0 }))
}

function send(socket, data) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data))
}

function broadcast(data) {
  for (const viewer of viewers.clients) send(viewer, data)
}

function broadcastRooms() {
  broadcast({ type: 'rooms', payload: rooms() })
}

function snapshot() {
  return {
    type: 'snapshot',
    payload: {
      rooms: rooms(),
      logs: Object.fromEntries(roomHistory),
    },
  }
}

async function serveFile(request, response) {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (requestUrl.pathname === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }

  const requestedPath = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.slice(1)
  let filePath = resolve(distDirectory, requestedPath)

  if (!filePath.startsWith(`${distDirectory}${sep}`)) {
    filePath = join(distDirectory, 'index.html')
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error('Not a file')
  } catch {
    filePath = join(distDirectory, 'index.html')
  }

  response.writeHead(200, {
    'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
}

const server = createServer((request, response) => {
  serveFile(request, response).catch(() => {
    response.writeHead(500)
    response.end('Internal server error')
  })
})

server.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (requestUrl.pathname === '/api/stream') {
    viewers.handleUpgrade(request, socket, head, (webSocket) => {
      viewers.emit('connection', webSocket, request)
    })
    return
  }

  if (requestUrl.pathname === '/api/logs') {
    const room = requestUrl.searchParams.get('room')?.trim().slice(0, 64)
    if (!room) return socket.destroy()

    request.logRoom = room
    producers.handleUpgrade(request, socket, head, (webSocket) => {
      producers.emit('connection', webSocket, request)
    })
    return
  }

  socket.destroy()
})

viewers.on('connection', (socket) => send(socket, snapshot()))

producers.on('connection', (socket, request) => {
  const room = request.logRoom
  if (!roomHistory.has(room)) roomHistory.set(room, [])
  producerCount.set(room, (producerCount.get(room) ?? 0) + 1)
  broadcastRooms()
  send(socket, { type: 'ready', room })

  socket.on('message', (data, isBinary) => {
    const message = isBinary ? data.toString('base64') : data.toString()
    const entry = {
      id: randomUUID(),
      room,
      at: new Date().toISOString(),
      message,
    }

    const history = roomHistory.get(room)
    history.push(entry)
    if (history.length > historySize) history.shift()
    broadcast({ type: 'log', payload: entry })
  })

  socket.on('close', () => {
    producerCount.set(room, Math.max(0, (producerCount.get(room) ?? 1) - 1))
    broadcastRooms()
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Live logs is running at http://localhost:${port}`)
  console.log(`Send logs to ws://localhost:${port}/api/logs?room=general`)
})
