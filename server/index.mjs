import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const port = Number(process.env.PORT ?? 8081)
const configuredHistorySize = Number(process.env.ROOM_HISTORY_SIZE ?? 500)
const historySize = Number.isFinite(configuredHistorySize)
  ? Math.max(1, configuredHistorySize)
  : 500
const distDirectory = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const settingsFile = resolve(
  process.env.SETTINGS_FILE ?? fileURLToPath(new URL('../data/settings.json', import.meta.url)),
)
const roomHistory = new Map()
const producerCount = new Map()
let settingsWrite = Promise.resolve()

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

function appendLog(room, message) {
  const isNewRoom = !roomHistory.has(room)
  if (isNewRoom) roomHistory.set(room, [])

  const entry = {
    id: randomUUID(),
    room,
    at: new Date().toISOString(),
    message,
  }
  const history = roomHistory.get(room)
  history.push(entry)
  if (history.length > historySize) history.shift()

  if (isNewRoom) broadcastRooms()
  broadcast({ type: 'log', payload: entry })
  return entry
}

async function readSettingsFile(path = settingsFile) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function loadSettingsState() {
  try {
    return { settings: await readSettingsFile(), hasValidPrimary: true }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { settings: { version: 1 }, hasValidPrimary: false }
    }
    try {
      return {
        settings: await readSettingsFile(`${settingsFile}.bak`),
        hasValidPrimary: false,
      }
    } catch {
      throw error
    }
  }
}

async function readSettings() {
  return (await loadSettingsState()).settings
}

function updateSettings(patch) {
  settingsWrite = settingsWrite.catch(() => undefined).then(async () => {
    const { settings, hasValidPrimary } = await loadSettingsState()
    const next = { ...settings, ...patch, version: 1 }
    const temporaryFile = `${settingsFile}.${process.pid}.tmp`

    await mkdir(dirname(settingsFile), { recursive: true })
    if (hasValidPrimary) await copyFile(settingsFile, `${settingsFile}.bak`)
    await writeFile(temporaryFile, `${JSON.stringify(next, null, 2)}\n`)
    await rename(temporaryFile, settingsFile)
    return next
  })

  return settingsWrite
}

async function readBody(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('Payload is too large')
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

async function readJsonBody(request) {
  const value = JSON.parse((await readBody(request)).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Settings payload must be an object')
  }
  return value
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

async function serveFile(request, response) {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (requestUrl.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok' })
    return
  }

  if (requestUrl.pathname === '/api/settings') {
    if (request.method === 'GET') {
      sendJson(response, 200, await readSettings())
      return
    }
    if (request.method === 'PATCH') {
      sendJson(response, 200, await updateSettings(await readJsonBody(request)))
      return
    }
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  if (requestUrl.pathname === '/api/rooms') {
    if (request.method !== 'DELETE') {
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }

    const room = requestUrl.searchParams.get('room')?.trim().slice(0, 64)
    if (!room) {
      sendJson(response, 400, { error: 'Room is required' })
      return
    }
    if ((producerCount.get(room) ?? 0) > 0) {
      sendJson(response, 409, { error: 'Room has an active producer' })
      return
    }
    if (!roomHistory.delete(room)) {
      sendJson(response, 404, { error: 'Room not found' })
      return
    }

    producerCount.delete(room)
    broadcastRooms()
    sendJson(response, 200, { room })
    return
  }

  if (requestUrl.pathname === '/api/logs') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }

    const room = requestUrl.searchParams.get('room')?.trim().slice(0, 64)
    if (!room) {
      sendJson(response, 400, { error: 'Room is required' })
      return
    }

    const entry = appendLog(room, (await readBody(request)).toString('utf8'))
    sendJson(response, 201, { id: entry.id, room: entry.room, at: entry.at })
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
    appendLog(room, message)
  })

  socket.on('close', () => {
    producerCount.set(room, Math.max(0, (producerCount.get(room) ?? 1) - 1))
    broadcastRooms()
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Live logs is running at http://localhost:${port}`)
  console.log(`Send logs to http://localhost:${port}/api/logs?room=general`)
  console.log(`Send logs to ws://localhost:${port}/api/logs?room=general`)
})
