import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, ref } from 'vue'
const strip = (source) => source.replace(/^import .*$/gm, '').replace(/^export /gm, '')
const source = strip(readFileSync('src/lib/event-types.ts', 'utf8')) + '\n' + strip(readFileSync('src/composables/useEventKinds.ts', 'utf8'))
const storage = new Map()
const patches = []
let storageListener
function setup(settings) {
  const context = vm.createContext({ ref, computed,
    parseLogMessage: (message) => JSON.parse(message),
    window: { addEventListener: (_, listener) => { storageListener = listener } },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    loadSettings: async () => settings, saveSettings: (patch) => patches.push(JSON.parse(JSON.stringify(patch))),
  })
  vm.runInContext(ts.transpile(source), context)
  return { context, kinds: context.useEventKinds() }
}
const { context, kinds } = setup({ errorEvents: { source: ['failure'] } })
await Promise.resolve()
assert.equal(kinds.kindForEvent('source', 'failure').id, 'error', 'Legacy server assignments migrate')
assert.equal(kinds.kindForEvent('source', 'unknown').id, 'info')
const log = { room: 'target', sourceRoom: 'source', message: '{"event":"failure"}' }
assert.equal(kinds.kindForLog(log).id, 'error', 'Routing preserves type')
kinds.saveKind({ id: 'custom', name: 'Проверить', color: '#eab308', sound: 'beep', volume: 0.25 })
kinds.setEventKind('source', 'failure', 'custom')
assert.equal(kinds.kindForLog(log).name, 'Проверить')
kinds.saveKind({ id: 'custom', name: 'Готово', color: '#22c55e', sound: 'none', volume: 0 })
assert.equal(kinds.kindForLog(log).name, 'Готово', 'Rename retains assignment')
assert.equal(kinds.kindForLog(log).color, '#22c55e')
assert.throws(() => kinds.saveKind({ id: 'duplicate', name: 'Готово', color: '#22c55e', sound: 'none', volume: 0 }))
const restored = setup(patches.at(-1)).kinds
await Promise.resolve()
assert.equal(restored.kindForLog(log).id, 'custom', 'Custom types and assignments survive reload')
kinds.deleteKind('custom', 'info')
assert.equal(kinds.kindForLog(log).id, 'info')
kinds.deleteKind('info', 'error')
assert.equal(kinds.kindForEvent('source', 'unknown').id, 'info', 'Default type cannot be deleted')
const refreshed = JSON.parse(storage.get('live-logs.event-types'))
refreshed.types[0].name = 'Сообщение'
storage.set('live-logs.event-types', JSON.stringify(refreshed))
storageListener({ key: 'live-logs.event-types' })
assert.equal(restored.types.value[0].name, 'Сообщение', 'Other tabs update')
assert.equal(context.badgeTextColor('#eab308'), '#111827')
assert.equal(context.badgeTextColor('#000000'), '#ffffff')
assert.equal(JSON.stringify(context.sumKindCounts(['r', 'r', 's'], { r: { info: 2, custom: 3 }, s: { custom: 4 } })), '{"info":2,"custom":7}')
let started = 0
const frequencies = []
const audio = { state: 'running', currentTime: 0, destination: {},
  createOscillator: () => ({ frequency: { setValueAtTime: (value) => frequencies.push(value), exponentialRampToValueAtTime() {} },
    connect: () => ({ connect() {} }), start() { started++ }, stop() {} }),
  createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }),
}
context.playKindSound(audio, { sound: 'none', volume: 1 })
context.playKindSound(audio, { sound: 'beep', volume: 0 })
assert.equal(started, 0)
context.playKindSound(audio, { sound: 'error', volume: 0.5 })
assert.equal(frequencies[0], 740)
context.playKindSound(audio, { sound: 'double', volume: 0.5 })
assert.equal(started, 3)
console.log('Event types: migration, creation, rename, delete/reassign, persistence, routed events, tab sync, counts, contrast and sounds passed')

for (const sound of vm.runInContext('soundOptions', context)) {
  const before = started
  context.playKindSound(audio, { sound: sound.id, volume: 0.5 })
  assert.equal(started > before, sound.id !== 'none', `Sound ${sound.id} should play unless muted`)
}
console.log('All sound presets passed')
