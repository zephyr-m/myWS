import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'

const directory = await mkdtemp(join(tmpdir(), 'myws-clear-test-'))
const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((resolve) => reservation.close(resolve))
const base = `http://127.0.0.1:${port}`
let server
const sockets = []
async function start() {
  server = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', PORT: String(port), LOG_HISTORY_FILE: join(directory, 'logs.jsonl'),
      SETTINGS_FILE: join(directory, 'settings.json') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000)
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited')) })
    server.stdout.on('data', () => { clearTimeout(timer); resolve() })
  })
}
async function stop() {
  const exited = once(server, 'exit')
  server.kill('SIGTERM')
  await exited
}
async function post(room, message) {
  const response = await fetch(`${base}/api/logs?room=${room}`, { method: 'POST', body: message })
  assert.equal(response.status, 201)
}
function next(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', listener); reject(new Error(`Missing ${type}`)) }, 5000)
    function listener(data) {
      const event = JSON.parse(String(data))
      if (event.type !== type) return
      clearTimeout(timer)
      socket.off('message', listener)
      resolve(event)
    }
    socket.on('message', listener)
  })
}
try {
  await start()
  await post('clear-me', 'old')
  await post('keep-me', 'keep')
  for (let index = 0; index < 2; index++) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/stream`)
    sockets.push(socket)
    await next(socket, 'snapshot')
  }
  const resets = sockets.map((socket) => next(socket, 'clear'))
  const response = await fetch(`${base}/api/logs?room=clear-me`, { method: 'DELETE' })
  assert.equal(response.status, 200)
  for (const event of await Promise.all(resets)) assert.equal(event.payload.room, 'clear-me')
  const persisted = (await readFile(join(directory, 'logs.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(persisted.map((log) => log.message), ['keep'])
  const fresh = sockets.map((socket) => next(socket, 'log'))
  await post('clear-me', 'new')
  for (const event of await Promise.all(fresh)) assert.equal(event.payload.message, 'new')
  await post('clear-me', 'different')
  const updates = sockets.map((socket) => next(socket, 'update'))
  await post('clear-me', 'new')
  for (const event of await Promise.all(updates)) {
    assert.equal(event.payload.count, 2)
    assert.equal(event.payload.times.length, 2)
  }
  const telegramBefore = await (await fetch(`${base}/api/telegram`)).json()
  assert.equal(telegramBefore.configured, false)
  assert.deepEqual(telegramBefore.events, [])
  const telegramRule = { room: 'destination', event: 'failure', enabled: true }
  const telegramResponse = await fetch(`${base}/api/telegram`, { method: 'PUT',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(telegramRule) })
  assert.equal(telegramResponse.status, 200)
  const route = { source: 'origin', event: 'failure', target: 'destination' }
  const saved = await fetch(`${base}/api/routes`, { method: 'PUT',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(route) })
  assert.equal(saved.status, 200)
  await post('origin', '{"event":"failure","message":"Error"}')
  for (const socket of sockets) socket.close()
  await stop()
  await start()
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/stream`)
  sockets.push(socket)
  const snapshot = await next(socket, 'snapshot')
  assert.deepEqual(snapshot.payload.logs['clear-me'].map((log) => log.message), ['different', 'new'])
  assert.equal(snapshot.payload.logs['clear-me'].at(-1).count, 2)
  const update = next(socket, 'update')
  await post('clear-me', 'new')
  assert.equal((await update).payload.count, 3)
  assert.equal(snapshot.payload.logs['keep-me'][0].message, 'keep')
  assert.equal(snapshot.payload.logs.destination[0].sourceRoom, 'origin')
  const telegramAfter = await (await fetch(`${base}/api/telegram`)).json()
  assert.deepEqual(telegramAfter.events, [{ room: 'destination', event: 'failure' }])
  assert.equal(telegramAfter.pending, 0)
  const restoredRoutes = await (await fetch(`${base}/api/routes`)).json()
  assert.deepEqual(restoredRoutes, [route])
  const routedUpdate = next(socket, 'update')
  await post('origin', '{"event":"failure","message":"Error"}')
  assert.equal((await routedUpdate).payload.room, 'destination')
  const reset = await fetch(`${base}/api/routes`, { method: 'PUT',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...route, target: null }) })
  assert.equal(reset.status, 200)
  const direct = next(socket, 'log')
  await post('origin', '{"event":"failure","message":"Error"}')
  assert.equal((await direct).payload.room, 'origin')
  console.log('Routes: persistence, delivery, restart and reset passed')
  console.log('History clear: two clients, disk persistence, new messages and restart passed')
} finally {
  for (const socket of sockets) socket.terminate()
  if (server?.exitCode === null) await stop()
  await rm(directory, { recursive: true, force: true })
}
