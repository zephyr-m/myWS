import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'
const source = readFileSync('server/index.mjs', 'utf8')
const events = []
const history = new Map()
let id = 0
const context = vm.createContext({ roomHistory: history, retentionMs: 3600000, historySize: Infinity,
  sequence: 0, eventRoutes: [], randomUUID: () => String(++id), persistHistoryEntry() {}, broadcastRooms() {},
  broadcast: (event) => events.push(event) })
vm.runInContext(source.slice(source.indexOf('function appendLog('), source.indexOf('async function readSettingsFile')), context)
const old = { id: 'old', room: 'r', message: 'A', at: new Date().toISOString() }
history.set('r', [old])
const a = context.appendLog('r', 'A')
const b = context.appendLog('r', 'B')
const repeated = context.appendLog('r', 'A')
assert.equal(repeated.id, a.id)
assert.equal(repeated.count, 2)
assert.equal(history.get('r').length, 3)
assert.equal(history.get('r')[0], old)
assert.equal(history.get('r')[1].id, b.id)
assert.equal(events.at(-1).type, 'update')
for (let index = 0; index < 15; index++) context.appendLog('r', 'A')
assert.equal(history.get('r').at(-1).count, 17)
assert.equal(history.get('r').at(-1).times.length, 10)
assert.equal(context.appendLog('other', 'A').count, 1)
assert.equal(context.appendLog('r', 'A ').count, 1)
const readSource = readFileSync('src/composables/useReadState.ts', 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')
const readContext = vm.createContext({ ref, localStorage: { getItem: () => null, setItem() {} },
  loadSettings: async () => null, saveSettings() {} })
vm.runInContext(ts.transpile(readSource), readContext)
const read = readContext.useReadState()
read.markReadThrough('r', a, [a])
assert.equal(read.firstUnreadIndex('r', [a]), 1)
assert.equal(read.firstUnreadIndex('r', [b, repeated]), 0)
read.markReadThrough('r', repeated, [b, repeated])
assert.equal(read.firstUnreadIndex('r', [b, repeated]), 2)
const sameTime = { ...repeated, sequence: repeated.sequence + 1 }
assert.equal(read.firstUnreadIndex('r', [b, sameTime]), 1)
read.markReadThrough('r', sameTime, [b, sameTime])
assert.equal(read.firstUnreadIndex('r', [b, sameTime]), 2)
console.log('Grouping: nonconsecutive repeats, legacy isolation, exact match, room isolation, last 10 times and unread revisions passed')

context.eventRoutes = [
  { source: 'source', event: 'failure', target: 'destination' },
  { source: 'destination', event: 'failure', target: 'source' },
]
const payload = JSON.stringify({ event: 'failure', message: 'Error' })
const routed = context.appendLog('source', payload)
assert.equal(routed.room, 'destination', 'Routing runs only once, even with a cycle')
assert.equal(routed.sourceRoom, 'source')
assert.equal(context.appendLog('source', payload).count, 2, 'Grouping occurs after routing')
assert.equal(context.appendLog('source', '{"event":"other"}').room, 'source')
assert.equal(context.appendLog('unrelated', payload).room, 'unrelated')
context.eventRoutes = []
assert.equal(context.appendLog('source', payload).room, 'source', 'Reset restores source delivery')
console.log('Routing: source/event matching, grouping, reset and cycle prevention passed')
