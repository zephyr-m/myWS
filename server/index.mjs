import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const port = Number(process.env.PORT ?? 8081)
const configuredHistorySize = Number(process.env.ROOM_HISTORY_SIZE ?? 0)
const historySize = Number.isFinite(configuredHistorySize) && configuredHistorySize > 0
  ? configuredHistorySize
  : Infinity
const configuredRetentionHours = Number(process.env.LOG_RETENTION_HOURS ?? 6)
const retentionHours = Number.isFinite(configuredRetentionHours) && configuredRetentionHours > 0
  ? configuredRetentionHours
  : 6
const retentionMs = retentionHours * 60 * 60 * 1000
const distDirectory = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const settingsFile = resolve(
  process.env.SETTINGS_FILE ?? fileURLToPath(new URL('../data/settings.json', import.meta.url)),
)
const historyFile = resolve(
  process.env.LOG_HISTORY_FILE ?? fileURLToPath(new URL('../data/logs.jsonl', import.meta.url)),
)
const roomHistory = new Map()
const producerCount = new Map()
let historyWrite = Promise.resolve()
let settingsWrite = Promise.resolve()
let sequence = 0
let eventRoutes = []

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

function isHistoryEntry(value) {
  return value
    && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.room === 'string'
    && typeof value.at === 'string'
    && Number.isFinite(Date.parse(value.at))
    && typeof value.message === 'string'
}

function pruneHistory() {
  const cutoff = Date.now() - retentionMs

  for (const [room, history] of roomHistory) {
    while (history.length && Date.parse(history[0].at) < cutoff) history.shift()
    if (history.length > historySize) history.splice(0, history.length - historySize)
    if (!history.length && (producerCount.get(room) ?? 0) === 0) roomHistory.delete(room)
  }
}

function enqueueHistoryWrite(task) {
  historyWrite = historyWrite
    .then(task)
    .catch((error) => console.error('Failed to persist log history:', error))
  return historyWrite
}

function persistHistoryEntry(entry) {
  const line = `${JSON.stringify(entry)}\n`
  void enqueueHistoryWrite(() => appendFile(historyFile, line))
}

function compactHistory() {
  pruneHistory()
  const entries = [...roomHistory.values()]
    .flat()
    .sort((first, second) => first.at.localeCompare(second.at))
  const contents = entries.map((entry) => JSON.stringify(entry)).join('\n')

  return enqueueHistoryWrite(async () => {
    const temporaryFile = `${historyFile}.${process.pid}.tmp`

    await writeFile(temporaryFile, contents ? `${contents}\n` : '')
    await rename(temporaryFile, historyFile)
  })
}

async function loadHistory() {
  await mkdir(dirname(historyFile), { recursive: true })

  try {
    const contents = await readFile(historyFile, 'utf8')
    const latest = new Map()
    for (const line of contents.split('\n')) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line)
        if (!isHistoryEntry(entry)) continue
        sequence = Math.max(sequence, entry.sequence ?? 0)
        latest.delete(entry.id)
        latest.set(entry.id, entry)
      } catch {
        // Ignore an incomplete final line left by an interrupted write.
      }
    }
    for (const entry of latest.values()) {
      const history = roomHistory.get(entry.room) ?? []
      history.push(entry)
      roomHistory.set(entry.room, history)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  pruneHistory()
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
  const sourceRoom = room
  let event = 'log'
  try {
    const parsed = JSON.parse(message)
    if (typeof parsed?.event === 'string') event = parsed.event.trim() || 'log'
  } catch { /* Plain text messages use the default event. */ }
  room = eventRoutes.find((rule) => rule.source === sourceRoom && rule.event === event)?.target ?? room

  const isNewRoom = !roomHistory.has(room)
  if (isNewRoom) roomHistory.set(room, [])

  const history = roomHistory.get(room)
  const cutoff = Date.now() - retentionMs
  while (history.length && Date.parse(history[0].at) < cutoff) history.shift()
  // Only entries created with grouping metadata participate; legacy logs stay intact.
  const existingIndex = history.findIndex((entry) => entry.count && entry.message === message && (entry.sourceRoom ?? entry.room) === sourceRoom)
  const previous = existingIndex >= 0 ? history.splice(existingIndex, 1)[0] : null
  const at = new Date().toISOString()
  const entry = {
    id: previous?.id ?? randomUUID(), room, sourceRoom, message, at,
    firstAt: previous?.firstAt ?? at,
    count: (previous?.count ?? 0) + 1,
    times: [...(previous?.times ?? []), at].slice(-10),
    sequence: sequence = Math.max(sequence + 1, Date.now() * 1000),
  }
  history.push(entry)
  if (history.length > historySize) history.shift()
  persistHistoryEntry(entry)

  if (isNewRoom) broadcastRooms()
  broadcast({ type: previous ? 'update' : 'log', payload: entry })
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
    const next = { ...settings, ...(typeof patch === 'function' ? patch(settings) : patch), version: 1 }
    const temporaryFile = `${settingsFile}.${process.pid}.tmp`

    await mkdir(dirname(settingsFile), { recursive: true })
    if (hasValidPrimary) await copyFile(settingsFile, `${settingsFile}.bak`)
    await writeFile(temporaryFile, `${JSON.stringify(next, null, 2)}\n`)
    await rename(temporaryFile, settingsFile)
    eventRoutes = Array.isArray(next.eventRoutes) ? next.eventRoutes : []
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

  if (requestUrl.pathname === '/api/routes') {
    if (request.method === 'GET') {
      sendJson(response, 200, eventRoutes)
      return
    }
    if (request.method !== 'PUT') {
      sendJson(response, 405, { error: 'Method not allowed' })
      return
    }
    const rule = await readJsonBody(request)
    const validRoom = (value) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 64
    if (!validRoom(rule.source) || typeof rule.event !== 'string' || !rule.event.trim()
      || (rule.target !== null && (!validRoom(rule.target) || rule.target === rule.source))) {
      sendJson(response, 400, { error: 'Invalid routing rule' })
      return
    }
    const next = await updateSettings((settings) => ({
      eventRoutes: [
        ...(Array.isArray(settings.eventRoutes) ? settings.eventRoutes : [])
          .filter((entry) => entry.source !== rule.source || entry.event !== rule.event),
        ...(rule.target === null ? [] : [{ source: rule.source, event: rule.event, target: rule.target }]),
      ],
    }))
    sendJson(response, 200, next.eventRoutes)
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
    await compactHistory()
    broadcastRooms()
    sendJson(response, 200, { room })
    return
  }

  if (requestUrl.pathname === '/api/logs') {
    if (request.method === 'DELETE') {
      const room = requestUrl.searchParams.get('room')?.trim().slice(0, 64)
      if (!room) {
        sendJson(response, 400, { error: 'Room is required' })
        return
      }
      if (roomHistory.has(room)) roomHistory.set(room, [])
      // Send the reset before awaiting disk I/O so later logs stay visible.
      broadcast({ type: 'clear', payload: { room } })
      await compactHistory()
      broadcastRooms()
      sendJson(response, 200, { room })
      return
    }
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

eventRoutes = (await readSettings()).eventRoutes ?? []
await loadHistory()
await compactHistory()

const historyCleanup = setInterval(() => {
  void compactHistory().then(broadcastRooms)
}, 60 * 60 * 1000)
historyCleanup.unref()

async function shutdown() {
  server.close()
  for (const socket of viewers.clients) socket.terminate()
  for (const socket of producers.clients) socket.terminate()
  await historyWrite
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

server.listen(port, '0.0.0.0', () => {
  console.log(`Live logs is running at http://localhost:${port}`)
  console.log(`Keeping log history for ${retentionHours} hours in ${historyFile}`)
  console.log(`Send logs to http://localhost:${port}/api/logs?room=general`)
  console.log(`Send logs to ws://localhost:${port}/api/logs?room=general`)
})
