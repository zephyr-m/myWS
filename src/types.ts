export interface LogEntry {
  id: string
  room: string
  at: string
  message: string
}

export interface RoomSummary {
  name: string
  producers: number
}

export type StreamEvent =
  | {
      type: 'snapshot'
      payload: {
        rooms: RoomSummary[]
        logs: Record<string, LogEntry[]>
      }
    }
  | { type: 'rooms'; payload: RoomSummary[] }
  | { type: 'clear'; payload: { room: string } }
  | { type: 'log'; payload: LogEntry }
