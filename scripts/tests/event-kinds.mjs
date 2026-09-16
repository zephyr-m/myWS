import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'
const source = readFileSync('src/composables/useEventKinds.ts', 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')
const storage = new Map()
const patches = []
let storageListener
const context = vm.createContext({ ref,
  parseLogMessage: (message) => JSON.parse(message),
  window: { addEventListener: (_, listener) => { storageListener = listener } },
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  loadSettings: async () => ({ errorEvents: { source: ['saved'] } }),
  saveSettings: (patch) => patches.push(patch),
})
vm.runInContext(ts.transpile(source), context)
const kinds = context.useEventKinds()
await Promise.resolve()
assert.equal(kinds.isErrorEvent('source', 'saved'), true)
assert.equal(kinds.isErrorEvent('source', 'unknown'), false)
const logs = [
  { room: 'target', sourceRoom: 'source', message: '{"event":"failure"}' },
  { room: 'target', sourceRoom: 'source', message: '{"event":"info"}' },
  { room: 'target', sourceRoom: 'other', message: '{"event":"failure"}' },
]
assert.equal(logs.filter(kinds.isErrorLog).length, 0)
kinds.setErrorEvent('source', 'failure', true)
assert.equal(logs.filter(kinds.isErrorLog).length, 1, 'Existing routed history changes classification')
assert.equal(logs.slice(1).filter(kinds.isErrorLog).length, 0, 'Read error no longer contributes to unread subset')
assert.equal(patches.at(-1).errorEvents.source.includes('failure'), true)
kinds.setErrorEvent('source', 'failure', false)
assert.equal(logs.filter(kinds.isErrorLog).length, 0)
storage.set('live-logs.error-events', JSON.stringify({ other: ['failure'] }))
storageListener({ key: 'live-logs.error-events' })
assert.equal(kinds.isErrorLog(logs[2]), true, 'Changes in another browser tab are applied')
console.log('Event kinds: defaults, settings restore, persistence, source isolation, routed history, unread subset and tab sync passed')
