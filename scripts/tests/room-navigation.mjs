import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, ref, watch } from 'vue'

// Exercise the real composable with isolated storage; never touch live settings.
const source = readFileSync(new URL('../../src/composables/useScreens.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '')
const code = ts.transpile(source, { module: ts.ModuleKind.None })
const placement = { name: 'backend', size: 'top', order: 3, place: { row: 'top', index: 2 } }
const oldServer = (id, rooms) => ({
  id, name: id, screens: [{ id: 'main', name: 'Основной', rooms, activeRoom: rooms[0]?.name ?? null }],
  openScreenIds: ['main'], activeScreenId: 'main',
})
const original = [{ id: 'contour', name: 'Контур', activeServerId: 'one',
  servers: [oldServer('one', [placement]), oldServer('two', [])] }]
const storage = new Map([['live-logs.hierarchy', JSON.stringify(original)]])
const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
function load() {
  const context = vm.createContext({ computed, ref, watch, localStorage,
    loadSettings: async () => null, saveSettings() {} })
  vm.runInContext(code, context)
  return context.useScreens()
}
const state = load()
assert.equal(state.activeServer.value.rooms.join(), 'backend', 'Legacy rooms acquire server ownership')
assert.equal(JSON.stringify(state.activeServer.value.screens[0].rooms), JSON.stringify([placement]))
state.openRoomTab('backend')
state.openRoomTab('backend')
assert.equal(state.activeServer.value.roomTabs.length, 1, 'Repeated opening selects existing tab')
state.toggleRoomPin('backend')
state.closeRoomTab('backend')
assert.equal(state.activeServer.value.roomTabs.length, 1, 'Pinned tab cannot be closed')
assert.equal(load().activeServer.value.pinnedRoomTabs.join(), 'backend', 'Pins survive reload')
state.toggleRoomPin('backend')
state.closeRoomTab('backend')
assert.equal(state.activeServer.value.rooms.join(), 'backend', 'Closing tab keeps ownership')
assert.equal(JSON.stringify(state.activeServer.value.screens[0].rooms), JSON.stringify([placement]))
state.openRoomTab('free')
assert.equal(state.activeServer.value.rooms.includes('free'), false, 'Opening a free room does not assign it')
state.openRoomTab('backend')
state.selectServer('contour', 'two')
state.openRoomTab('other')
state.selectServer('contour', 'one')
assert.equal(state.activeServer.value.activeRoomTab, 'backend', 'Server switch restores its active tab')
const restored = load()
assert.equal(restored.activeServer.value.roomTabs.join(), 'free,backend', 'Tabs survive reload')
assert.equal(restored.activeServer.value.activeRoomTab, 'backend')
state.assignRoom('backend', 'one')
assert.equal(state.activeServer.value.screens[0].rooms.length, 1, 'Same-server assignment preserves layout')
state.assignRoom('backend', 'two')
assert.equal(state.activeServer.value.rooms.includes('backend'), false)
assert.equal(state.activeServer.value.screens[0].rooms.length, 0)
state.selectServer('contour', 'two')
assert.equal(state.activeServer.value.rooms.includes('backend'), true)
assert.equal(state.activeServer.value.screens[0].rooms.length, 0, 'Server assignment does not create screen placement')
state.releaseRoom('backend')
assert.equal(state.activeServer.value.rooms.includes('backend'), false)
console.log('Room navigation: migration, tabs, persistence, independent layouts, assignment and release passed')
