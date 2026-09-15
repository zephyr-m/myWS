import { computed, ref, watch } from 'vue'
import { loadSettings, saveSettings } from '@/lib/settings-store'

export type RoomSize = 'full' | 'top' | 'bottom'
export type RoomRow = Exclude<RoomSize, 'full'>

export interface RoomPlace {
  row: RoomRow
  index: number
}

export interface OpenRoom {
  name: string
  size: RoomSize
  order: number
  place: RoomPlace
}

export interface LogScreen {
  id: string
  name: string
  rooms: OpenRoom[]
  activeRoom: string | null
}

export interface LogServer {
  id: string
  name: string
  rooms: string[]
  pinnedRoomTabs: string[]
  roomTabs: string[]
  activeRoomTab: string | null
  screens: LogScreen[]
  openScreenIds: string[]
  activeScreenId: string
}

export interface LogContour {
  id: string
  name: string
  servers: LogServer[]
  activeServerId: string
}

const hierarchyStorageKey = 'live-logs.hierarchy'
const activeContourStorageKey = 'live-logs.active-contour'
const legacyScreensStorageKey = 'live-logs.screens'
const legacyActiveScreenStorageKey = 'live-logs.active-screen'
const legacyTabsStorageKey = 'live-logs.screen-tabs'

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function mainScreen(): LogScreen {
  return { id: 'main', name: 'Основной', rooms: [], activeRoom: null }
}

function createServer(name: string, screens: LogScreen[] = [mainScreen()]): LogServer {
  return {
    id: makeId('server'),
    name,
    rooms: [...new Set(screens.flatMap((screen) => screen.rooms.map((room) => room.name)))],
    pinnedRoomTabs: [],
    roomTabs: [],
    activeRoomTab: null,
    screens,
    openScreenIds: ['main'],
    activeScreenId: 'main',
  }
}

function createContour(name: string, servers: LogServer[] = [createServer('Основной сервер')]): LogContour {
  return {
    id: makeId('contour'),
    name,
    servers,
    activeServerId: servers[0].id,
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}

function normalizeHierarchy(contours: LogContour[]) {
  const assignedRooms = new Set<string>()
  const ownedRooms = new Set<string>()

  for (const contour of contours) {
    if (!Array.isArray(contour.servers) || contour.servers.length === 0) {
      contour.servers = [createServer('Основной сервер')]
    }

    for (const server of contour.servers) {
      if (!Array.isArray(server.screens) || server.screens.length === 0) {
        server.screens = [mainScreen()]
      }
      if (!server.screens.some((screen) => screen.id === 'main')) {
        server.screens.unshift(mainScreen())
      }

      for (const screen of server.screens) {
        if (!Array.isArray(screen.rooms)) screen.rooms = []
        screen.rooms = screen.rooms.filter((room) => {
          if (assignedRooms.has(room.name)) return false
          assignedRooms.add(room.name)
          return true
        })
        if (!screen.rooms.some((room) => room.name === screen.activeRoom)) {
          screen.activeRoom = null
        }
      }

      server.rooms = [...new Set([
        ...(Array.isArray(server.rooms) ? server.rooms.filter((room) => typeof room === 'string') : []),
        ...server.screens.flatMap((screen) => screen.rooms.map((room) => room.name)),
      ])].filter((room) => {
        if (ownedRooms.has(room)) return false
        ownedRooms.add(room)
        return true
      })
      server.roomTabs = [...new Set(Array.isArray(server.roomTabs) ? server.roomTabs.filter((room) => typeof room === 'string') : [])]
      server.pinnedRoomTabs = [...new Set(Array.isArray(server.pinnedRoomTabs) ? server.pinnedRoomTabs.filter((room) => server.roomTabs.includes(room)) : [])]
      if (!server.roomTabs.includes(server.activeRoomTab ?? '')) server.activeRoomTab = server.roomTabs[0] ?? null

      const screenIds = new Set(server.screens.map((screen) => screen.id))
      server.openScreenIds = [...new Set(
        (Array.isArray(server.openScreenIds) ? server.openScreenIds : [])
          .filter((id) => screenIds.has(id)),
      )]
      if (server.openScreenIds.length === 0) server.openScreenIds = ['main']
      if (!server.openScreenIds.includes(server.activeScreenId)) {
        server.activeScreenId = server.openScreenIds[0]
      }
    }

    if (!contour.servers.some((server) => server.id === contour.activeServerId)) {
      contour.activeServerId = contour.servers[0].id
    }
  }

  return contours
}

function migrateLegacyHierarchy() {
  const storedScreens = readJson<LogScreen[]>(legacyScreensStorageKey, [])
  const screens = Array.isArray(storedScreens) && storedScreens.length ? storedScreens : [mainScreen()]
  if (!screens.some((screen) => screen.id === 'main')) screens.unshift(mainScreen())

  const server = createServer('Основной сервер', screens)
  const screenIds = new Set(screens.map((screen) => screen.id))
  const storedTabs = readJson<string[]>(legacyTabsStorageKey, [])
  server.openScreenIds = [...new Set(
    (Array.isArray(storedTabs) ? storedTabs : []).filter((id) => screenIds.has(id)),
  )]
  if (server.openScreenIds.length === 0) server.openScreenIds = ['main']

  const storedActiveScreen = localStorage.getItem(legacyActiveScreenStorageKey)
  server.activeScreenId = storedActiveScreen && server.openScreenIds.includes(storedActiveScreen)
    ? storedActiveScreen
    : server.openScreenIds[0]

  return [createContour('Основной контур', [server])]
}

function loadHierarchy() {
  const stored = readJson<LogContour[]>(hierarchyStorageKey, [])
  if (Array.isArray(stored) && stored.length) return normalizeHierarchy(stored)
  return normalizeHierarchy(migrateLegacyHierarchy())
}

export function useScreens() {
  const contours = ref<LogContour[]>(loadHierarchy())
  let hydrating = false
  let localRevision = 0
  const storedActiveContour = localStorage.getItem(activeContourStorageKey)
  const activeContourId = ref(
    contours.value.some((contour) => contour.id === storedActiveContour)
      ? storedActiveContour!
      : contours.value[0].id,
  )
  const activeContour = computed(() =>
    contours.value.find((contour) => contour.id === activeContourId.value) ?? contours.value[0],
  )
  const activeServer = computed(() =>
    activeContour.value.servers.find((server) => server.id === activeContour.value.activeServerId)
      ?? activeContour.value.servers[0],
  )
  const activeServerId = computed(() => activeServer.value.id)
  const activeScreen = computed(() =>
    activeServer.value.screens.find((screen) => screen.id === activeServer.value.activeScreenId)
      ?? activeServer.value.screens[0],
  )
  const activeScreenId = computed(() => activeScreen.value.id)
  const openScreens = computed(() => activeServer.value.openScreenIds
    .map((id) => activeServer.value.screens.find((screen) => screen.id === id))
    .filter((screen): screen is LogScreen => Boolean(screen)))
  const openRooms = computed<OpenRoom[]>({
    get: () => activeScreen.value.rooms,
    set: (rooms) => { activeScreen.value.rooms = rooms },
  })
  const activeRoom = computed<string | null>({
    get: () => activeScreen.value.activeRoom,
    set: (room) => { activeScreen.value.activeRoom = room },
  })

  localStorage.setItem(hierarchyStorageKey, JSON.stringify(contours.value))
  watch(contours, (value) => {
    localStorage.setItem(hierarchyStorageKey, JSON.stringify(value))
    if (!hydrating) {
      localRevision += 1
      saveSettings({ hierarchy: value })
    }
  }, { deep: true, flush: 'sync' })
  watch(activeContourId, (value) => {
    localStorage.setItem(activeContourStorageKey, value)
    if (!hydrating) {
      localRevision += 1
      saveSettings({ activeContourId: value })
    }
  }, { flush: 'sync' })

  hydrateSettings()

  function hydrateSettings() {
    const revision = localRevision

    loadSettings().then((settings) => {
      if (!settings || localRevision !== revision) return
      if (Array.isArray(settings.hierarchy) && settings.hierarchy.length) {
        hydrating = true
        contours.value = normalizeHierarchy(settings.hierarchy as LogContour[])
        activeContourId.value = settings.activeContourId
          && contours.value.some((contour) => contour.id === settings.activeContourId)
          ? settings.activeContourId
          : contours.value[0].id
        localStorage.setItem(hierarchyStorageKey, JSON.stringify(contours.value))
        localStorage.setItem(activeContourStorageKey, activeContourId.value)
        hydrating = false
      } else {
        saveSettings({
          activeContourId: activeContourId.value,
          hierarchy: contours.value,
        })
      }
    })
  }

  function findServer(serverId: string) {
    for (const contour of contours.value) {
      const server = contour.servers.find((candidate) => candidate.id === serverId)
      if (server) return { contour, server }
    }
    return null
  }

  function openRoomTab(room: string, serverId = activeServerId.value) {
    const target = findServer(serverId)
    if (!target) return
    selectServer(target.contour.id, serverId)
    if (!target.server.roomTabs.includes(room)) target.server.roomTabs.push(room)
    target.server.activeRoomTab = room
  }

  function toggleRoomPin(room: string) {
    const server = activeServer.value
    if (!server.roomTabs.includes(room)) return
    server.pinnedRoomTabs = server.pinnedRoomTabs.includes(room)
      ? server.pinnedRoomTabs.filter((name) => name !== room)
      : [...server.pinnedRoomTabs, room]
  }

  function closeRoomTab(room: string, server = activeServer.value, force = false) {
    if (!force && server.pinnedRoomTabs.includes(room)) return
    server.pinnedRoomTabs = server.pinnedRoomTabs.filter((name) => name !== room)
    const index = server.roomTabs.indexOf(room)
    if (index < 0) return
    server.roomTabs.splice(index, 1)
    if (server.activeRoomTab === room) {
      server.activeRoomTab = server.roomTabs[Math.min(index, server.roomTabs.length - 1)] ?? null
    }
  }

  function assignRoom(room: string, serverId: string) {
    const target = findServer(serverId)
    if (!target) return
    for (const contour of contours.value) {
      for (const server of contour.servers) {
        if (server.id === serverId) continue
        server.rooms = server.rooms.filter((name) => name !== room)
        closeRoomTab(room, server, true)
        for (const screen of server.screens) {
          screen.rooms = screen.rooms.filter((entry) => entry.name !== room)
          if (screen.activeRoom === room) screen.activeRoom = null
        }
      }
    }
    if (!target.server.rooms.includes(room)) target.server.rooms.push(room)
  }

  function releaseRoom(room: string) {
    for (const contour of contours.value) {
      for (const server of contour.servers) {
        server.rooms = server.rooms.filter((name) => name !== room)
        for (const screen of server.screens) {
          screen.rooms = screen.rooms.filter((entry) => entry.name !== room)
          if (screen.activeRoom === room) screen.activeRoom = null
        }
      }
    }
  }

  function addContour(name: string) {
    const contour = createContour(name)
    contours.value.push(contour)
    activeContourId.value = contour.id
  }

  function renameContour(id: string, name: string) {
    const contour = contours.value.find((candidate) => candidate.id === id)
    if (contour) contour.name = name
  }

  function deleteContour(id: string) {
    if (contours.value.length === 1) return
    contours.value = contours.value.filter((contour) => contour.id !== id)
    if (activeContourId.value === id) activeContourId.value = contours.value[0].id
  }

  function selectContour(id: string) {
    if (contours.value.some((contour) => contour.id === id)) activeContourId.value = id
  }

  function addServer(contourId: string, name: string) {
    const contour = contours.value.find((candidate) => candidate.id === contourId)
    if (!contour) return
    const server = createServer(name)
    contour.servers.push(server)
    selectServer(contourId, server.id)
  }

  function renameServer(serverId: string, name: string) {
    const target = findServer(serverId)
    if (target) target.server.name = name
  }

  function deleteServer(serverId: string) {
    const target = findServer(serverId)
    if (!target || target.contour.servers.length === 1) return
    target.contour.servers = target.contour.servers.filter((server) => server.id !== serverId)
    if (target.contour.activeServerId === serverId) {
      target.contour.activeServerId = target.contour.servers[0].id
    }
  }

  function selectServer(contourId: string, serverId: string) {
    const contour = contours.value.find((candidate) => candidate.id === contourId)
    if (!contour || !contour.servers.some((server) => server.id === serverId)) return
    contour.activeServerId = serverId
    activeContourId.value = contourId
  }

  function addScreen(serverId: string, name: string) {
    const target = findServer(serverId)
    if (!target) return
    const screen: LogScreen = {
      id: makeId('screen'),
      name,
      rooms: [],
      activeRoom: null,
    }
    target.server.screens.push(screen)
    selectScreen(serverId, screen.id)
  }

  function renameScreen(serverId: string, id: string, name: string) {
    const target = findServer(serverId)
    const screen = target?.server.screens.find((candidate) => candidate.id === id)
    if (screen && screen.id !== 'main') screen.name = name
  }

  function deleteScreen(serverId: string, id: string) {
    const target = findServer(serverId)
    if (!target || id === 'main') return
    target.server.screens = target.server.screens.filter((screen) => screen.id !== id)
    closeScreenTab(id, target.server)
  }

  function selectScreen(serverId: string, id: string) {
    const target = findServer(serverId)
    if (!target || !target.server.screens.some((screen) => screen.id === id)) return
    if (!target.server.openScreenIds.includes(id)) target.server.openScreenIds.push(id)
    target.server.activeScreenId = id
    target.contour.activeServerId = serverId
    activeContourId.value = target.contour.id
  }

  function closeScreenTab(id: string, server: LogServer = activeServer.value) {
    const tabIndex = server.openScreenIds.indexOf(id)
    if (tabIndex < 0) return

    const wasActive = server.activeScreenId === id
    server.openScreenIds = server.openScreenIds.filter((screenId) => screenId !== id)
    if (server.openScreenIds.length === 0) server.openScreenIds = ['main']
    if (wasActive) {
      server.activeScreenId = server.openScreenIds[Math.min(tabIndex, server.openScreenIds.length - 1)]
    }
  }

  return {
    toggleRoomPin,
    openRoomTab,
    closeRoomTab,
    assignRoom,
    releaseRoom,
    activeContour,
    activeContourId,
    activeRoom,
    activeScreen,
    activeScreenId,
    activeServer,
    activeServerId,
    addContour,
    addScreen,
    addServer,
    closeScreenTab,
    contours,
    deleteContour,
    deleteScreen,
    deleteServer,
    openRooms,
    openScreens,
    renameContour,
    renameScreen,
    renameServer,
    selectContour,
    selectScreen,
    selectServer,
  }
}
