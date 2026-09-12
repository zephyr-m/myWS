export interface ParsedLogMessage {
  event: string
  message: string
}

export function parseLogMessage(rawMessage: string): ParsedLogMessage {
  try {
    const value = JSON.parse(rawMessage) as Record<string, unknown>
    if (!value || typeof value !== 'object' || typeof value.event !== 'string') {
      return { event: 'log', message: rawMessage }
    }

    const event = value.event.trim() || 'log'
    const message = typeof value.message === 'string' ? value.message : ''
    const data = value.data === undefined ? '' : JSON.stringify(value.data, null, 2)

    return {
      event,
      message: [message, data].filter(Boolean).join('\n') || rawMessage,
    }
  } catch {
    return { event: 'log', message: rawMessage }
  }
}
