import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'
const source = readFileSync('src/composables/useReadState.ts', 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')
const at = '2026-09-16T12:00:00.000Z'
const log = (id, sequence) => ({ id, sequence, at, room: 'r', message: id })
function setup(stored = {}, hydration = Promise.resolve(null)) {
  const saves = []
  const context = vm.createContext({ ref,
    localStorage: { getItem: () => JSON.stringify(stored), setItem() {} },
    loadSettings: () => hydration, saveSettings: (patch) => saves.push(patch),
  })
  vm.runInContext(ts.transpile(source), context)
  return { read: context.useReadState(), saves }
}
const a = log('a', 1), b = log('b', 2), a2 = log('a', 3), c = log('c', 4)
{
  const { read } = setup()
  read.markReadThrough('r', a, [a, b])
  assert.equal(read.firstUnreadIndex('r', [a, b]), 1)
  assert.equal(read.firstUnreadIndex('r', [b, a2]), 0, 'Repeat of cursor record must not hide intervening message')
  read.markReadThrough('r', b, [b, a2])
  assert.equal(read.firstUnreadIndex('r', [b, a2]), 1)
  read.markReadThrough('r', a2, [b, a2])
  assert.equal(read.firstUnreadIndex('r', [b, a2, c]), 2)
  read.markReadThrough('r', a, [b, a2, c])
  assert.equal(read.firstUnreadIndex('r', [b, a2, c]), 2, 'Stale reads cannot move cursor backwards')
  assert.equal(read.firstUnreadIndex('other', [log('other', 1)]), 0)
  assert.equal(read.firstUnreadIndex('r', []), 0)
  assert.equal(read.firstUnreadIndex('r', [c]), 0, 'Pruning/clearing must not hide subsequent logs')
}
{
  const { read } = setup()
  read.markReadThrough('r', b, [b]) // A is filtered out.
  assert.equal(read.firstUnreadIndex('r', [a, b]), 2, 'Cursor retains read-through semantics when filter is removed')
  assert.equal(read.firstUnreadIndex('r', [b, a2]), 1, 'A new repeat of hidden/previously read record is unread')
  read.markReadThrough('r', c, [b, a2, c]) // Read all.
  assert.equal(read.firstUnreadIndex('r', [b, a2, c]), 3)
  assert.equal(read.firstUnreadIndex('r', [a2, c, log('b', 5)]), 2)
}
{
  const { read } = setup({ r: { id: 'a', at, sequence: 1 } })
  assert.equal(read.firstUnreadIndex('r', [b, a2]), 0, 'Restore cursor after reconnect/reload')
  const legacy = { id: 'legacy', at: '2026-09-16T11:00:00.000Z', room: 'r', message: '' }
  const legacyRead = setup({ r: { id: legacy.id, at: legacy.at } }).read
  assert.equal(legacyRead.firstUnreadIndex('r', [legacy, a]), 1)
}
{
  let resolve
  const hydration = new Promise((done) => { resolve = done })
  const { read } = setup({}, hydration)
  read.markReadThrough('r', b, [a, b])
  resolve({ readState: { r: { id: a.id, at, sequence: 1 } } })
  await Promise.resolve()
  assert.equal(read.firstUnreadIndex('r', [a, b]), 2, 'Late settings load cannot undo a local read')
}
console.log('Read cursors: repeats, same timestamp, filters, read-all, pruning, reload and late hydration passed')

// Reproduce a WebSocket update arriving before Vue patches the existing DOM.
const feed = readFileSync('src/components/LogFeed.vue', 'utf8')
const markVisible = feed.slice(feed.indexOf('function markVisibleAsRead()'), feed.indexOf('\nfunction activate()'))
const makeElement = (entry, index, bottom) => ({
  dataset: { logIndex: String(index), logId: entry.id, logSequence: String(entry.sequence), logAt: entry.at },
  getBoundingClientRect: () => ({ top: bottom - 40, bottom }),
})
const emitted = []
let elements = [makeElement(a, 0, 60), makeElement(b, 1, 110)]
const props = { active: true, firstUnreadIndex: 0, logs: [b, a2] }
const document = { visibilityState: 'visible' }
const context = vm.createContext({ props, document, readingArmed: true, positioning: false,
  viewport: { value: { getBoundingClientRect: () => ({ top: 0, bottom: 150 }), querySelectorAll: () => elements } },
  emit: (_, entry) => emitted.push(entry),
})
vm.runInContext(ts.transpile(markVisible), context)
context.markVisibleAsRead()
assert.equal(emitted.at(-1)?.sequence, b.sequence, 'Old DOM must read the displayed B, not the unseen repeated A now at index 1')
// The same record was repeated again but its DOM still shows the older revision.
elements = [makeElement(a, 0, 60)]
emitted.length = 0
props.logs = [a2]
context.markVisibleAsRead()
assert.equal(emitted.length, 0, 'An old rendering must not mark a new revision read')
elements = [makeElement(a2, 0, 60)]
context.markVisibleAsRead()
assert.equal(emitted.at(-1)?.sequence, a2.sequence)
emitted.length = 0
document.visibilityState = 'hidden'
context.markVisibleAsRead()
assert.equal(emitted.length, 0, 'Background tabs must not mark messages read from scroll events')
console.log('Visible reads: stable DOM identity, revision matching and background-tab guard passed')
